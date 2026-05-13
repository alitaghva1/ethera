extends SceneTree

# Iter 121 — Two playtest-reported regressions from iter-115..iter-120:
#
#   1. HUD shelf intrusion. iter-119 set TopBarBacking to offset_bottom
#      = 130 px so the strip would cover HP (10-40) + Status (46-70) +
#      RelicStrip (74-122). Walls only cover y=0..96 — so 34 px of the
#      shelf sat ON TOP of the playable interior. Read as "the dark bar
#      comes down into the play area."
#
#   2. "YOU DIED" title doubling. death_screen.tscn TitleGlow was 108pt
#      and the foreground Title was 96 pt. The 12 pt size differential
#      made the dim-red glow letters peek ABOVE AND BELOW the bright-red
#      foreground, reading as a stamped duplicate. Plus the panel border
#      was 4 px crimson at alpha 0.95 with a 14 px crimson shadow —
#      "garish neon-red frame" that fought the dark-fantasy palette.
#
# Iter-121 fixes both:
#
#   HUD shelf (scenes/main.tscn)
#     • TopBarBacking offset_bottom 130 → 96 (stops at PLAY_AREA_MIN.y).
#     • top_bar_style bg alpha 0.42 → 0.30, border alpha 0.55 → 0.40.
#
#   Death screen (scenes/death_screen.tscn)
#     • TitleGlow font_size 108 → 96 (matches foreground; halo now comes
#       from the 18 px outline only, not from a bigger letterform).
#     • TitleGlow outline color shifted warm-ember (was crimson) so the
#       bloom reads as "the moment of dying glows orange," consistent
#       with the boss-intro palette.
#     • Title font_color slightly warmer + outline_color near-black-red
#       (was solid black) for a more rendered look.
#     • panel_style: border_width 4/2 → uniform 2, color crimson alpha
#       0.95 → warm-gold alpha 0.45, shadow crimson → ember warm.
#       Plus radius 8 → 10 and content_margin 28/24 → 32/26 for breathing
#       room.
func _initialize() -> void:
	var ok := true

	# ═══ HUD shelf intrusion fix ═══
	# Note: iter-122 superseded this iter-121 fix by moving the WORLD
	# top wall to y=128 and making the shelf fully opaque. The iter-121
	# fix (shrunk shelf to 96 + translucent) was a stopgap that the
	# proper iter-122 refactor replaced. We keep this test focused on
	# the iter-121-era DEATH-SCREEN fixes (below) which are unchanged.
	if ok:
		print("OK HUD intrusion fix is now subsumed by iter-122's world-shift design")

	# ═══ Death screen title — eliminate size differential ═══
	var death_tscn := FileAccess.get_file_as_string("res://scenes/death_screen.tscn")
	# Both TitleGlow and Title MUST be the same font_size now.
	# TitleGlow was 108, foreground was 96. Target: both 96.
	# Count "font_size = 96" near "YOU DIED" labels — should be 2 (glow + Title).
	var glow_font_correct: bool = death_tscn.contains("name=\"TitleGlow\"") and death_tscn.contains("theme_override_font_sizes/font_size = 96")
	if not glow_font_correct:
		push_error("FAIL: TitleGlow + Title should BOTH be font_size 96")
		ok = false
	if "theme_override_font_sizes/font_size = 108" in death_tscn:
		push_error("FAIL: 108 pt glow size still present — would re-introduce doubling")
		ok = false
	# Wider glow outline to compensate for matched size
	if "theme_override_constants/outline_size = 18" not in death_tscn:
		push_error("FAIL: TitleGlow outline_size should be 18 (was 14) — bloom comes from outline only now")
		ok = false
	# Glow font_color alpha 0 (fully transparent), outline carries the halo
	if "font_color = Color(0.92, 0.30, 0.30, 0)" not in death_tscn:
		push_error("FAIL: TitleGlow font_color should be transparent — bloom is outline-only")
		ok = false
	if ok:
		print("OK YOU DIED title: matched 96 pt + transparent fill + 18 px outline halo (no more doubling)")

	# ═══ Panel border tamed ═══
	# Pre-iter-121: border_width_top/bottom = 4, border_color crimson alpha 0.95
	if "border_width_top = 2" not in death_tscn:
		push_error("FAIL: panel border_width_top should be uniform 2 (was 4)")
		ok = false
	if "border_color = Color(0.78, 0.55, 0.35, 0.45)" not in death_tscn:
		push_error("FAIL: panel border should be warm-gold alpha 0.45 (was crimson alpha 0.95)")
		ok = false
	# Shadow shifted to warm-ember
	if "shadow_color = Color(0.85, 0.45, 0.18, 0.40)" not in death_tscn:
		push_error("FAIL: panel shadow should be warm-ember (was crimson)")
		ok = false
	if "shadow_size = 18" not in death_tscn:
		push_error("FAIL: panel shadow_size should be 18 (was 14)")
		ok = false
	if ok:
		print("OK death panel border: uniform 2 px + warm-gold @ 0.45 + warm-ember shadow")

	# ═══ Runtime: death_screen scene instantiates cleanly ═══
	var ds_scene: PackedScene = load("res://scenes/death_screen.tscn")
	if ds_scene == null:
		push_error("FAIL: death_screen.tscn no longer loads")
		ok = false
	else:
		var d: Node = ds_scene.instantiate()
		var title: Label = d.get_node_or_null("Panel/Stack/TitleBlock/Title")
		var glow: Label = d.get_node_or_null("Panel/Stack/TitleBlock/TitleGlow")
		if title == null or glow == null:
			push_error("FAIL: death_screen missing Title or TitleGlow node")
			ok = false
		else:
			var title_size: int = title.get_theme_font_size("font_size")
			var glow_size: int = glow.get_theme_font_size("font_size")
			if title_size != glow_size:
				push_error("FAIL: Title font_size %d != TitleGlow font_size %d at runtime (must match)" % [title_size, glow_size])
				ok = false
			else:
				print("OK runtime Title + TitleGlow both at font_size = %d" % title_size)
		d.queue_free()

	if ok:
		print("=== ITER 121 INTEGRATION PASSED ===")
	else:
		print("=== ITER 121 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
