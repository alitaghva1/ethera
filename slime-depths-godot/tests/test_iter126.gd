extends SceneTree

# Iter 126 — Main-menu typography pass + corner-overlap fix.
#
# Playtest read on the iter-111 menu state:
#   • "Text choice for ETHERA and the sub is bad" — every label
#     rendered in Godot's default Noto Sans, a clean modern sans-serif
#     that fights the dark-fantasy mood.
#   • "Bottom version cuts the lines we have at the corners at times"
#     — VersionLabel x range (-260, -36) overlapped CornerBR's L-hairline
#     at x (-100, -36); StatsBlock x range (48, 344) overlapped CornerBL
#     at x (36, 100). Records text ran THROUGH the bottom-left corner
#     flourish.
#
# Iter-126 ships two coordinated fixes:
#
#   TYPOGRAPHY
#     Two SystemFont sub-resources. SystemFont tries each font name in
#     order and falls back gracefully if none install. Worst-case
#     fallback is Georgia or Times New Roman (every desktop OS ships
#     these), already far better than Noto Sans for dark fantasy.
#       title_font: Cinzel → Trajan → Georgia → Times → "serif" @ 700
#       body_font:  Cinzel → Cormorant Garamond → Georgia → Times @ 400
#     Applied via theme_override_fonts/font on:
#       • Title + TitleGlow (title_font)
#       • Subtitle, StatsTitle, StatsRuns, StatsBestRun, StatsLifetimeKills,
#         StatsLastRun, VersionLabel (body_font)
#     Title font_size 96 → 88 + TitleGlow matched 110 → 88 (was 110, would
#     re-introduce iter-121 ghost-letter doubling under the heavier serif
#     glyphs). Bloom now comes purely from outline_size differential
#     (18 px glow vs 6 px Title).
#
#   CORNER-OVERLAP FIX
#     StatsBlock offset_left 48 → 116 (16 px past CornerBL's x=100 right
#     edge). offset_right 344 → 412 to preserve 296 px text width.
#     VersionLabel offset_left -260 → -340 + offset_right -36 → -116
#     (right edge at viewport-116, 16 px before CornerBR at viewport-100).
func _initialize() -> void:
	var ok := true

	var tscn := FileAccess.get_file_as_string("res://scenes/main_menu.tscn")

	# ═══ SystemFont sub_resources ═══
	if "[sub_resource type=\"SystemFont\" id=\"title_font\"]" not in tscn:
		push_error("FAIL: missing title_font SystemFont sub_resource")
		ok = false
	if "[sub_resource type=\"SystemFont\" id=\"body_font\"]" not in tscn:
		push_error("FAIL: missing body_font SystemFont sub_resource")
		ok = false
	# Title font should include Cinzel + Trajan + a universal fallback
	if "\"Cinzel\"" not in tscn:
		push_error("FAIL: SystemFont chain doesn't include Cinzel")
		ok = false
	if "\"Times New Roman\"" not in tscn:
		push_error("FAIL: SystemFont chain doesn't include Times New Roman fallback")
		ok = false
	# title_font should be bold (700)
	if "font_weight = 700" not in tscn:
		push_error("FAIL: title_font should declare font_weight = 700")
		ok = false
	if ok:
		print("OK SystemFont chain: Cinzel → Trajan → Georgia → Times (bold + regular)")

	# ═══ Fonts applied to the right labels ═══
	# Title + TitleGlow should both use title_font
	var title_block_idx: int = tscn.find("name=\"Title\" type=\"Label\" parent=\"TitleBlock\"")
	var title_glow_idx: int = tscn.find("name=\"TitleGlow\" type=\"Label\" parent=\"TitleBlock\"")
	if title_block_idx < 0 or title_glow_idx < 0:
		push_error("FAIL: Title or TitleGlow node missing from TitleBlock")
		ok = false
	else:
		var title_block: String = tscn.substr(title_block_idx, 600)
		var title_glow_block: String = tscn.substr(title_glow_idx, 600)
		if "theme_override_fonts/font = SubResource(\"title_font\")" not in title_block:
			push_error("FAIL: Title doesn't apply title_font")
			ok = false
		if "theme_override_fonts/font = SubResource(\"title_font\")" not in title_glow_block:
			push_error("FAIL: TitleGlow doesn't apply title_font")
			ok = false
		if ok:
			print("OK Title + TitleGlow both wear title_font")

	# Title + TitleGlow must be the SAME font_size (iter-121 fix; prevents
	# ghost-letter doubling). We just want both to be 88 pt.
	if "theme_override_font_sizes/font_size = 88" not in tscn:
		push_error("FAIL: Title font_size should be 88 (matched to TitleGlow)")
		ok = false
	# Pre-iter-126 110 pt glow should be gone — that was the doubling source
	if "theme_override_font_sizes/font_size = 110" in tscn:
		push_error("FAIL: 110 pt glow still present — would cause iter-121-style doubling under serif")
		ok = false
	if ok:
		print("OK TitleGlow + Title both at 88 pt (no doubling under serif)")

	# Body font applied across the menu. iter-128 retired the Subtitle
	# Label so the count dropped from 7 → 6: StatsTitle + StatsRuns +
	# StatsBestRun + StatsLifetimeKills + StatsLastRun + VersionLabel.
	var body_font_uses: int = 0
	for line in tscn.split("\n"):
		if "SubResource(\"body_font\")" in line or "SubResource(\"body_font_italic\")" in line:
			body_font_uses += 1
	if body_font_uses < 6:
		push_error("FAIL: body_font applied to only %d labels, expected ≥6 (5 records + version)" % body_font_uses)
		ok = false
	else:
		print("OK serif body_font applied to %d labels (records + version)" % body_font_uses)

	# ═══ Corner-overlap fix ═══
	# StatsBlock: offset_left 116 + offset_right 412 (was 48 + 344)
	if "offset_left = 116.0\noffset_top = -150.0\noffset_right = 412.0" not in tscn:
		push_error("FAIL: StatsBlock offsets should be 116..412 to clear CornerBL (was 48..344)")
		ok = false
	# VersionLabel: offset_left -340 + offset_right -116
	if "offset_left = -340.0" not in tscn:
		push_error("FAIL: VersionLabel offset_left should be -340 (was -260)")
		ok = false
	if "offset_right = -116.0" not in tscn:
		push_error("FAIL: VersionLabel offset_right should be -116 (was -36, overlapped CornerBR)")
		ok = false
	if ok:
		print("OK records + version label shifted clear of CornerBL/CornerBR hairlines")

	# ═══ Runtime ═══
	var scene: PackedScene = load("res://scenes/main_menu.tscn")
	if scene == null:
		push_error("FAIL: main_menu.tscn no longer loads after typography pass")
		ok = false

	if ok:
		print("=== ITER 126 INTEGRATION PASSED ===")
	else:
		print("=== ITER 126 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
