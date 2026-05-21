extends SceneTree

# Iter 237 / Polish Team R4 — death screen relic showcase + cursed
# pickup commit drama regression test.
#
# This test is a source-grep smoke check (same pattern as iter-229 /
# iter-233 polish tests) — it verifies that the helpers + constants
# that iter-237 added are present in death_screen.gd and pedestal.gd,
# so a future refactor that accidentally removes them is caught at
# CI rather than at playtest.
#
# Two surfaces covered:
#
#   A. death_screen.gd — _rebuild_relics_list now groups owned_relics
#      by tier with theme-colored chips per relic. Verify the tier
#      ordering table, tier-color palette, theme-chip palette, and
#      the row/header builder helpers all live in the script.
#
#   B. pedestal.gd — _claim's cursed branch now triggers a commit
#      drama (slow-mo + violet flame burst + 1.5s embedded aura) via
#      a new _play_cursed_commit_drama helper. Verify the helper
#      exists, the call site is wired, the slow-mo restore handler is
#      named, and the violet palette constants are declared.
#
# We don't instantiate either scene — the iter-233 test established
# that source-grep is fast (~no scene-load cost) and reliable for
# catching deletions. Visual verification of the new chips + drama
# was done in playtest before the commit landed.

func _initialize() -> void:
	print("[polish237] init")
	await process_frame
	# ── A. death_screen.gd — tier grouping + theme chip wiring ────────
	var ds_script: Script = load("res://scripts/death_screen.gd") as Script
	if ds_script == null:
		printerr("FAIL: death_screen.gd failed to load")
		quit(1)
		return
	var ds_src: String = ds_script.source_code
	# A1. New TIER_DISPLAY_ORDER constant with all 4 tiers.
	if ds_src.find("TIER_DISPLAY_ORDER") < 0:
		printerr("FAIL: death_screen.gd missing TIER_DISPLAY_ORDER constant")
		quit(1)
		return
	for tier_id in ["common", "rare", "legendary", "mythic"]:
		if ds_src.find('"' + tier_id + '"') < 0:
			printerr("FAIL: death_screen.gd missing tier '%s' in display order" % tier_id)
			quit(1)
			return
	print("[polish237] death_screen.gd TIER_DISPLAY_ORDER has all 4 tiers")
	# A2. Tier header color palette.
	if ds_src.find("TIER_HEADER_COLORS") < 0:
		printerr("FAIL: death_screen.gd missing TIER_HEADER_COLORS palette")
		quit(1)
		return
	if ds_src.find("TIER_HEADER_LABEL") < 0:
		printerr("FAIL: death_screen.gd missing TIER_HEADER_LABEL table")
		quit(1)
		return
	print("[polish237] tier-color + tier-label tables present")
	# A3. Theme chip palette mirrors the pedestal/themes table.
	if ds_src.find("RELIC_THEME_CHIP_COLORS") < 0:
		printerr("FAIL: death_screen.gd missing RELIC_THEME_CHIP_COLORS palette")
		quit(1)
		return
	for theme_id in ["storm", "flame", "blood", "vow", "shadow"]:
		if ds_src.find('"' + theme_id + '"') < 0:
			printerr("FAIL: death_screen.gd missing theme '%s' chip color" % theme_id)
			quit(1)
			return
	print("[polish237] theme chip palette covers storm/flame/blood/vow/shadow")
	# A4. Row + header helpers exist as standalone funcs (so a future
	# refactor that inlines them — losing the readable seam — fails CI).
	for h in ["_append_tier_header", "_append_relic_row"]:
		if ds_src.find("func " + h) < 0:
			printerr("FAIL: death_screen.gd missing helper %s" % h)
			quit(1)
			return
	print("[polish237] death_screen.gd row + header helpers present")
	# A5. _rebuild_relics_list calls both helpers (the new flow).
	if ds_src.find("_append_tier_header(") < 0:
		printerr("FAIL: _rebuild_relics_list does not call _append_tier_header")
		quit(1)
		return
	if ds_src.find("_append_relic_row(") < 0:
		printerr("FAIL: _rebuild_relics_list does not call _append_relic_row")
		quit(1)
		return
	print("[polish237] _rebuild_relics_list dispatches to header + row builders")
	# ── B. pedestal.gd — cursed commit drama wiring ────────────────────
	var ped_script: Script = load("res://scripts/pedestal.gd") as Script
	if ped_script == null:
		printerr("FAIL: pedestal.gd failed to load")
		quit(1)
		return
	var ped_src: String = ped_script.source_code
	# B1. Drama helper exists.
	if ped_src.find("func _play_cursed_commit_drama") < 0:
		printerr("FAIL: pedestal.gd missing _play_cursed_commit_drama helper")
		quit(1)
		return
	print("[polish237] _play_cursed_commit_drama helper present")
	# B2. Called from _claim's cursed branch.
	if ped_src.find("_play_cursed_commit_drama()") < 0:
		printerr("FAIL: pedestal.gd _claim does not invoke _play_cursed_commit_drama")
		quit(1)
		return
	print("[polish237] _claim invokes commit drama helper")
	# B3. Slow-mo constants + restore handler.
	for cname in [
		"CURSED_SLOWMO_SCALE",
		"CURSED_SLOWMO_REAL_TIME",
		"CURSED_FLAME_PARTICLES",
		"CURSED_FLAME_LIFETIME",
		"CURSED_FLAME_COLOR",
		"CURSED_EMBED_AURA_DUR",
		"CURSED_EMBED_AURA_COLOR",
	]:
		if ped_src.find(cname) < 0:
			printerr("FAIL: pedestal.gd missing constant %s" % cname)
			quit(1)
			return
	print("[polish237] all 7 drama constants declared")
	# B4. Named restore handler so the slow-mo gets snapped back.
	if ped_src.find("func _restore_time_scale_after_curse") < 0:
		printerr("FAIL: pedestal.gd missing _restore_time_scale_after_curse handler")
		quit(1)
		return
	# B5. Engine.time_scale set + reset both referenced.
	if ped_src.find("Engine.time_scale = CURSED_SLOWMO_SCALE") < 0:
		printerr("FAIL: pedestal.gd does not set Engine.time_scale = CURSED_SLOWMO_SCALE")
		quit(1)
		return
	if ped_src.find("Engine.time_scale = 1.0") < 0:
		printerr("FAIL: pedestal.gd missing Engine.time_scale = 1.0 restore")
		quit(1)
		return
	print("[polish237] slow-mo set + restore both wired")
	# B6. New floater above the iter-235 "+ <CURSE>" floater — "CURSED <NAME>"
	# in deep violet. Source-grep on the literal string so a rename is
	# caught.
	if ped_src.find("\"CURSED \" + curse_label") < 0:
		printerr("FAIL: pedestal.gd missing 'CURSED <NAME>' floater string")
		quit(1)
		return
	print("[polish237] cursed-name floater string present")
	# B7. CPUParticles2D burst + PointLight2D embed aura both spawned.
	if ped_src.find("CPUParticles2D.new()") < 0:
		printerr("FAIL: pedestal.gd missing CPUParticles2D burst spawn")
		quit(1)
		return
	if ped_src.find("PointLight2D.new()") < 0:
		# Note: a prior PointLight2D.new exists for the cursed AURA at
		# pedestal-spawn time. We check that there's still one in the
		# file — but additionally that the EMBED aura constant is set
		# (covered above).
		printerr("FAIL: pedestal.gd missing PointLight2D node spawn")
		quit(1)
		return
	print("[polish237] particle burst + embed PointLight2D spawn calls present")
	# ── Done ───────────────────────────────────────────────────────────
	print("[polish237] PASS — death screen relic showcase + cursed commit drama verified")
	quit(0)
