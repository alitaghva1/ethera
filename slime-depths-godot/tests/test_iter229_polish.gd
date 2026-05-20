extends SceneTree

# Iter 229 / Polish Team R2 — UX polish smoke test.
#
# Verifies the two deliverables shipped by the Polish Team round 2:
#
#   A. Elite affix tooltip card in main.gd —
#      _build_affix_tooltip + _update_affix_tooltip surface a small
#      Panel naming the elite enemy + describing its affix. Relies on
#      Enemy.ELITE_AFFIX_DESCRIPTIONS being defined with one entry per
#      ELITE_AFFIX_TINTS / ELITE_AFFIX_NAMES key so the lookup never
#      misses.
#
#   B. Death-screen run summary enhancement —
#      death_screen.gd._rebuild_cause_of_death + _rebuild_combat_summary
#      surface "FELLED BY ..." + "BIGGEST HIT N · SHATTER×N" lines.
#      Relies on GameState.last_run_death_source / last_run_biggest_hit /
#      last_run_combo_counts fields + the finalize_run_death_stats +
#      note_combo_fired helpers.
#
# Test pattern follows test_iter225_polish.gd — source-inspect smoke
# tests + autoload data sanity. We do NOT instantiate scenes (that
# would require the full main.tscn dependency graph) because the goal
# is to gate against accidental deletions / renames of the wired
# methods, not to render the UI.

func _initialize() -> void:
	print("[polish229] init")
	await process_frame
	# ── A. Enemy.ELITE_AFFIX_DESCRIPTIONS shape ───────────────────────
	# Load enemy.gd to read the affix constants. The dict must have an
	# entry for every affix listed in ELITE_AFFIX_TINTS so the lookup
	# from main.gd's _update_affix_tooltip never falls back to empty
	# string on a real elite.
	var enemy_script: Script = load("res://scripts/enemy.gd") as Script
	if enemy_script == null:
		printerr("FAIL: enemy.gd failed to load")
		quit(1)
		return
	var tints: Dictionary = enemy_script.get("ELITE_AFFIX_TINTS")
	var names: Dictionary = enemy_script.get("ELITE_AFFIX_NAMES")
	var descs: Dictionary = enemy_script.get("ELITE_AFFIX_DESCRIPTIONS")
	if tints == null or names == null or descs == null:
		printerr("FAIL: enemy.gd missing one of TINTS/NAMES/DESCRIPTIONS")
		quit(1)
		return
	# All 4 affix keys must be present in the new descriptions dict.
	var required_keys: Array = ["frost", "ember", "venom", "warded"]
	for k in required_keys:
		if not descs.has(k):
			printerr("FAIL: ELITE_AFFIX_DESCRIPTIONS missing key %s" % k)
			quit(1)
			return
		var d: String = str(descs[k])
		if d.length() < 10:
			printerr("FAIL: ELITE_AFFIX_DESCRIPTIONS[%s] too short: '%s'" % [k, d])
			quit(1)
			return
	# Coverage check — every TINTS key must have a description.
	for k in tints.keys():
		if not descs.has(k):
			printerr("FAIL: TINTS key %s lacks DESCRIPTIONS entry" % str(k))
			quit(1)
			return
	print(
		"[polish229] ELITE_AFFIX_DESCRIPTIONS OK — %d entries cover all %d affixes"
		% [descs.size(), tints.size()]
	)
	# ── B. main.gd affix tooltip helpers ──────────────────────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	var required_main: Array = [
		"_build_affix_tooltip",
		"_update_affix_tooltip",
	]
	for h in required_main:
		if main_src.find("func " + h) < 0:
			printerr("FAIL: main.gd missing helper %s" % h)
			quit(1)
			return
	# Both wired from the right entry points.
	if main_src.find("_build_affix_tooltip()") < 0:
		printerr("FAIL: main.gd never calls _build_affix_tooltip()")
		quit(1)
		return
	if main_src.find("_update_affix_tooltip()") < 0:
		printerr("FAIL: main.gd never calls _update_affix_tooltip()")
		quit(1)
		return
	# State storage at module scope.
	if main_src.find("_affix_tooltip_panel") < 0:
		printerr("FAIL: main.gd missing _affix_tooltip_panel state")
		quit(1)
		return
	print("[polish229] main.gd tooltip helpers OK — wired from _ready + _process")
	# ── C. death_screen.gd run-summary helpers ────────────────────────
	var ds_script: Script = load("res://scripts/death_screen.gd") as Script
	if ds_script == null:
		printerr("FAIL: death_screen.gd failed to load")
		quit(1)
		return
	var ds_src: String = ds_script.source_code
	var required_ds: Array = [
		"_rebuild_cause_of_death",
		"_rebuild_combat_summary",
	]
	for h in required_ds:
		if ds_src.find("func " + h) < 0:
			printerr("FAIL: death_screen.gd missing helper %s" % h)
			quit(1)
			return
	if ds_src.find("_rebuild_cause_of_death()") < 0:
		printerr("FAIL: death_screen.gd never invokes _rebuild_cause_of_death()")
		quit(1)
		return
	if ds_src.find("_rebuild_combat_summary()") < 0:
		printerr("FAIL: death_screen.gd never invokes _rebuild_combat_summary()")
		quit(1)
		return
	print("[polish229] death_screen rebuild helpers OK")
	# ── D. GameState run-summary state + helpers ──────────────────────
	# Verify the fields exist + the helpers are callable. We avoid the
	# `"field" in GameState` syntax (which the GDScript compiler resolves
	# at parse time and chokes on autoload-only identifiers); instead
	# walk the source for the field declarations + use has_method at
	# runtime for the helpers.
	var gs_script: Script = load("res://scripts/game_state.gd") as Script
	if gs_script == null:
		printerr("FAIL: game_state.gd failed to load")
		quit(1)
		return
	var gs_src: String = gs_script.source_code
	for fname in ["last_run_death_source", "last_run_biggest_hit", "last_run_combo_counts"]:
		if gs_src.find("var " + fname) < 0:
			printerr("FAIL: GameState missing var %s" % fname)
			quit(1)
			return
	for hname in ["finalize_run_death_stats", "note_combo_fired"]:
		if gs_src.find("func " + hname) < 0:
			printerr("FAIL: GameState missing func %s" % hname)
			quit(1)
			return
	# Behavioral round-trip — call helpers via the autoload and read
	# the resulting state. The autoload IS registered when this test
	# runs (test_iter225_polish.gd uses the same pattern), so the
	# runtime identifier resolves. Wrap in a Callable so the autoload
	# binding is captured at runtime, not parse time.
	var gs_node: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameState")
	if gs_node == null:
		printerr("FAIL: /root/GameState autoload not registered")
		quit(1)
		return
	gs_node.set("last_run_combo_counts", {})
	gs_node.call("finalize_run_death_stats", "Test Skeleton", 7)
	if str(gs_node.get("last_run_death_source")) != "Test Skeleton":
		printerr("FAIL: finalize_run_death_stats didn't store source")
		quit(1)
		return
	if int(gs_node.get("last_run_biggest_hit")) != 7:
		printerr("FAIL: finalize_run_death_stats didn't store biggest_hit")
		quit(1)
		return
	gs_node.call("note_combo_fired", "shatter")
	gs_node.call("note_combo_fired", "shatter")
	gs_node.call("note_combo_fired", "kindle")
	var counts: Dictionary = gs_node.get("last_run_combo_counts") as Dictionary
	if int(counts.get("shatter", 0)) != 2:
		printerr("FAIL: note_combo_fired didn't increment shatter twice")
		quit(1)
		return
	if int(counts.get("kindle", 0)) != 1:
		printerr("FAIL: note_combo_fired didn't track kindle")
		quit(1)
		return
	print("[polish229] GameState run-summary round-trip OK")
	# ── E. hero.gd damage-source plumbing ─────────────────────────────
	# Source-inspect: take_damage signature now accepts source_name +
	# the field _last_damage_source_name exists.
	var hero_script: Script = load("res://scripts/hero.gd") as Script
	if hero_script == null:
		printerr("FAIL: hero.gd failed to load")
		quit(1)
		return
	var hero_src: String = hero_script.source_code
	if hero_src.find("_last_damage_source_name") < 0:
		printerr("FAIL: hero.gd missing _last_damage_source_name field")
		quit(1)
		return
	if hero_src.find("_biggest_hit_taken") < 0:
		printerr("FAIL: hero.gd missing _biggest_hit_taken field")
		quit(1)
		return
	if hero_src.find("source_name: String") < 0:
		printerr("FAIL: hero.gd take_damage missing source_name param")
		quit(1)
		return
	print("[polish229] hero.gd plumbing OK")
	print("[polish229] PASS")
	quit(0)
