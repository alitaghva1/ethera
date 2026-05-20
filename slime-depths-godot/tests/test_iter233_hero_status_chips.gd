extends SceneTree

# Iter 233 / Polish Team R3 — HERO STATUS CHIPS smoke test.
#
# Verifies the world-space status-chip strip that hovers above the hero
# showing active elite-affix DoTs (slow / venom). The chips are built
# programmatically in main.gd (no .tscn edits) and polled per-frame
# against hero.gd's _hero_slow_remaining + _hero_venom_remaining fields.
#
# UX audit gap closed by iter-233: prior iters showed a one-shot SLOW /
# VENOM floater when the affix LANDED on the player but had no persistent
# indicator while the effect was active. Player couldn't tell if they
# were still slowed or how long it would last. Iter-233 adds 2 chips
# above the hero, each with a tiny duration label ("1.2s"), so the
# active-status read is glanceable from anywhere on screen.
#
# Test pattern follows test_iter229_polish.gd and test_iter231_reaction_web —
# source-inspect smoke tests (we don't instantiate main.tscn because the
# scene-load path takes ~10s in headless and the goal here is to gate
# against accidental deletions / renames). The chips themselves are
# already covered by check_main_loads.gd's scene-instantiation check.

func _initialize() -> void:
	print("[polish233] init")
	await process_frame
	# ── A. hero.gd has the two status fields we expect to poll ────────
	# Polish team mandate: we READ these, never mutate them. If the field
	# names change in a future hero refactor, the chip updater will hide
	# silently — but this test will catch the rename so the chips can be
	# re-pointed before they go invisible in production.
	var hero_script: Script = load("res://scripts/hero.gd") as Script
	if hero_script == null:
		printerr("FAIL: hero.gd failed to load")
		quit(1)
		return
	var hero_src: String = hero_script.source_code
	for fname in ["_hero_slow_remaining", "_hero_venom_remaining"]:
		if hero_src.find("var " + fname) < 0:
			printerr("FAIL: hero.gd missing var %s — chip updater can't poll" % fname)
			quit(1)
			return
	print("[polish233] hero.gd status fields present (_hero_slow_remaining, _hero_venom_remaining)")
	# ── B. main.gd has the chip builder + updater + state vars ────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	# Helper functions exist.
	for h in ["_build_hero_status_chips", "_update_hero_status_chips"]:
		if main_src.find("func " + h) < 0:
			printerr("FAIL: main.gd missing helper %s" % h)
			quit(1)
			return
	# Helpers are called from the right entry points (build from _ready,
	# update from _process). We search for the bare call site (with
	# parens) rather than just the name so we don't false-positive on a
	# comment that mentions the function.
	if main_src.find("_build_hero_status_chips()") < 0:
		printerr("FAIL: main.gd never calls _build_hero_status_chips()")
		quit(1)
		return
	if main_src.find("_update_hero_status_chips()") < 0:
		printerr("FAIL: main.gd never calls _update_hero_status_chips()")
		quit(1)
		return
	# Module-scope state for the strip + chip dict.
	for v in ["_hero_status_strip", "_hero_status_chips"]:
		if main_src.find("var " + v) < 0:
			printerr("FAIL: main.gd missing state var %s" % v)
			quit(1)
			return
	# Polls the right hero fields (these are the read-only field names).
	for f in ["_hero_slow_remaining", "_hero_venom_remaining"]:
		if main_src.find(f) < 0:
			printerr("FAIL: main.gd never references hero field %s" % f)
			quit(1)
			return
	# Status spec includes both expected status ids (slow + venom).
	# We look for the string-quoted spec entries the builder uses so
	# we'd catch a typo or a deletion before the chips silently vanish.
	for id in ["\"slow\"", "\"venom\""]:
		if main_src.find(id) < 0:
			printerr("FAIL: main.gd missing status id %s in chip specs" % id)
			quit(1)
			return
	print("[polish233] main.gd chip helpers OK — builder + updater + state + wiring")
	# ── C. Layout constants present (offset + size) ───────────────────
	# These constants are part of the public "shape" of the chips —
	# changing them is fine, but DELETING them likely indicates the
	# strip got accidentally yanked.
	for c in ["HERO_STATUS_CHIP_OFFSET", "HERO_STATUS_CHIP_W", "HERO_STATUS_CHIP_H"]:
		if main_src.find("const " + c) < 0:
			printerr("FAIL: main.gd missing const %s" % c)
			quit(1)
			return
	print("[polish233] main.gd chip layout constants OK")
	# ── D. Wiring sanity — strip is added to the UI CanvasLayer ───────
	# We don't want a stray chip layer in a random parent (e.g. /root),
	# so source-grep that the builder uses $UI as its add_child target
	# (same pattern as the cooldown strip + affix tooltip).
	if main_src.find("ui_root.add_child(_hero_status_strip)") < 0:
		printerr("FAIL: main.gd builder doesn't parent _hero_status_strip to $UI")
		quit(1)
		return
	print("[polish233] main.gd chip strip parents to $UI canvas layer")
	print("[polish233] PASS")
	quit(0)
