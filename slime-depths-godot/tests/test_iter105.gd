extends SceneTree

# Iter 105 — phoenix_feather true once-per-run.
#
# Iter-101 surfaced the bug: phoenix_feather description claimed
# "Once per run, a killing blow restores you to FULL HP" but the
# gating flag (_phoenix_feather_used in hero.gd) was a hero instance
# var. Every room transition reloads main.tscn → fresh hero instance
# → flag resets to false. The relic effectively triggered once per
# ROOM, giving 6 free revives per floor on a legendary stat-line.
# That's mythic-tier output.
#
# Iter-101 honest-fixed the DESCRIPTION to "Each room…" as a stop-gap.
# Iter-105 fixes the BEHAVIOR: promotes the flag to
# GameState.phoenix_feather_used, which only resets on
# start_dungeon_run. Description reverted to the honest "Once per run"
# claim. The relic now matches its original design intent — a
# dramatic one-shot save, not a per-encounter safety net.
#
# (Second_wind's per-room reset is preserved by design — it's the
# per-encounter safety net distinct from phoenix's premium one-shot.)
func _initialize() -> void:
	var ok := true

	# ═══ 1. GameState exposes phoenix_feather_used ═══
	var gs_src := FileAccess.get_file_as_string("res://scripts/game_state.gd")
	if "var phoenix_feather_used" not in gs_src:
		push_error("FAIL: GameState missing phoenix_feather_used field")
		ok = false
	else:
		print("OK GameState.phoenix_feather_used field exists")

	# ═══ 2. Reset in start_dungeon_run ═══
	var sd_idx: int = gs_src.find("func start_dungeon_run")
	if sd_idx >= 0:
		var sd_body: String = gs_src.substr(sd_idx, 1000)
		if "phoenix_feather_used = false" not in sd_body:
			push_error("FAIL: start_dungeon_run doesn't reset phoenix_feather_used")
			ok = false
		else:
			print("OK start_dungeon_run resets phoenix_feather_used to false")

	# ═══ 3. hero.gd no longer has the instance var ═══
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	# Look for active-code declaration (var _phoenix_feather_used).
	# Comments referencing the removal are fine.
	var hero_lines: PackedStringArray = hero_src.split("\n")
	var live_decl: int = 0
	for line in hero_lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		if "var _phoenix_feather_used" in line:
			live_decl += 1
	if live_decl > 0:
		push_error("FAIL: hero.gd still declares _phoenix_feather_used as instance var")
		ok = false
	else:
		print("OK hero.gd no longer declares _phoenix_feather_used instance var")

	# ═══ 4. hero.gd reads/writes GameState.phoenix_feather_used ═══
	if not hero_src.contains("not GameState.phoenix_feather_used"):
		push_error("FAIL: hero.gd doesn't gate phoenix proc on GameState.phoenix_feather_used")
		ok = false
	if not hero_src.contains("GameState.phoenix_feather_used = true"):
		push_error("FAIL: hero.gd doesn't set GameState.phoenix_feather_used on proc")
		ok = false
	if ok:
		print("OK hero.gd reads + writes GameState.phoenix_feather_used")

	# ═══ 5. Description matches new "Once per run" intent ═══
	var pf_idx: int = gs_src.find("\"phoenix_feather\": {")
	if pf_idx >= 0:
		var pf_block: String = gs_src.substr(pf_idx, 600)
		if "Once per run, a killing blow restores you to FULL HP" not in pf_block:
			push_error("FAIL: phoenix_feather description not reverted to 'Once per run'")
			ok = false
		elif "Each room, a killing blow restores you to FULL HP" in pf_block:
			push_error("FAIL: phoenix_feather still has 'Each room' description — must be one or the other")
			ok = false
		else:
			print("OK phoenix_feather description = 'Once per run' (matches new behavior)")

	# ═══ 6. Runtime — verify GameState flag survives across hero instantiations ═══
	# Set flag to true, instantiate hero (simulates a room transition),
	# verify the new hero reads the flag from GameState.
	# We use Engine.get_singleton instead of direct GameState access
	# to avoid the autoload-resolution issue in test --script context.
	# Skip if GameState autoload isn't reachable (test isolation).
	var gs_obj = Engine.get_singleton("GameState") if Engine.has_singleton("GameState") else null
	if gs_obj != null:
		# Snapshot + set flag true to simulate "phoenix triggered last room"
		var prior_flag: bool = gs_obj.phoenix_feather_used
		gs_obj.phoenix_feather_used = true
		# Instantiate a fresh hero (simulates room reload)
		var hero_scene := load("res://scenes/hero.tscn") as PackedScene
		if hero_scene != null:
			var hero: Node = hero_scene.instantiate()
			root.add_child(hero)
			# The flag should still be true after a fresh hero spawn — that's
			# the whole point of promoting it to GameState.
			if not gs_obj.phoenix_feather_used:
				push_error("FAIL: GameState.phoenix_feather_used flipped during hero instantiate (would re-arm phoenix per room)")
				ok = false
			else:
				print("OK GameState.phoenix_feather_used survives hero re-instantiate")
			hero.queue_free()
		# Restore prior state to not pollute other tests
		gs_obj.phoenix_feather_used = prior_flag
	else:
		print("SKIP runtime survival check (GameState autoload not resolvable in this test context)")

	if ok:
		print("=== ITER 105 INTEGRATION PASSED ===")
	else:
		print("=== ITER 105 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
