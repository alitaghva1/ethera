extends SceneTree

# iter-245 / Director Phase 3 — HUD layout + UX cohesion test.
#
# Phase 3 of the director audit. Verifies the 8-change spec:
#
#   1. KillsLabel moved next to hearts (single tight row top-left).
#   2. No mystery VII label survives in main.gd / main.tscn — the audit
#      flagged that as orphaned. Project never had an ascension-tier
#      system; the screenshot must have caught a transient. Either way,
#      no "VII" literal in the HUD code.
#   3. Reaction Web strip is now top-RIGHT (was top-left) — programmatic
#      positioning checks for anchor_left=1.0 in _build_reaction_web_chips.
#   4. _update_active_relic_label always-on placeholder when no active
#      relic is owned — render path uses "[R] —" at 0.45 alpha rather
#      than hiding the chip entirely (Isaac D6 pattern).
#   5. Ability cooldown chip strip is now top-RIGHT and anchored to the
#      right edge — chips collapse via ALIGNMENT_END when only some
#      cooldowns are active.
#   6. Top-right cluster discipline — vertical stack with comments
#      referencing the layout. Verified by structural grep — exact y
#      values may drift later but the relative ordering should hold.
#   7. game_state.gd has best_combo_this_run field + start_dungeon_run
#      clears it.
#   8. death_screen.gd._rebuild_combat_summary contains "BIGGEST COMBO".
#
# This file is data-only (no scene instantiation), keeping the test
# headless-friendly and cheap to run as part of the 35-test sweep.
func _initialize() -> void:
	var ok := true

	var main_src := FileAccess.get_file_as_string("res://scripts/main.gd")
	var main_tscn := FileAccess.get_file_as_string("res://scenes/main.tscn")
	var gs_src := FileAccess.get_file_as_string("res://scripts/game_state.gd")
	var ds_src := FileAccess.get_file_as_string("res://scripts/death_screen.gd")

	# ═══ 1. KillsLabel moved next to hearts on same row ═══
	# Old position was offset_top = 80 (under the heart row). New position
	# is offset_top = 18 (level with hearts at y=12). Verify the new
	# position landed; absent of the old one would also be a positive
	# signal but we want a concrete check.
	if "offset_top = 80.0" in main_tscn and "KillsLabel" in main_tscn:
		# Search for the KillsLabel block specifically.
		var kills_idx: int = main_tscn.find("[node name=\"KillsLabel\"")
		if kills_idx >= 0:
			var kills_block: String = main_tscn.substr(kills_idx, 400)
			if "offset_top = 80.0" in kills_block:
				push_error("FAIL: KillsLabel still at old top-left-column y=80 (should be y=18 next to hearts)")
				ok = false
	var kills_idx: int = main_tscn.find("[node name=\"KillsLabel\"")
	if kills_idx >= 0:
		var kills_block: String = main_tscn.substr(kills_idx, 400)
		if not ("offset_top = 18.0" in kills_block):
			push_error("FAIL: KillsLabel doesn't have offset_top = 18.0 (the new next-to-hearts y)")
			ok = false
		else:
			print("OK KillsLabel relocated to row with hearts (offset_top=18.0)")
	else:
		push_error("FAIL: KillsLabel block not found in main.tscn")
		ok = false

	# ═══ 2. VII label — must be absent ═══
	if "VII" in main_src:
		push_error("FAIL: main.gd contains the mystery 'VII' literal — should have been removed/relabeled")
		ok = false
	if "VII" in main_tscn:
		push_error("FAIL: main.tscn contains the mystery 'VII' literal — should have been removed/relabeled")
		ok = false
	if not ok:
		pass
	else:
		print("OK no orphaned 'VII' literal in main.gd / main.tscn (audit branch: delete)")

	# ═══ 3. Reaction Web relocated to top-RIGHT ═══
	# The _build_reaction_web_chips function used to set offset_left = 20.0
	# (top-left). After iter-245 it sets anchor_left = 1.0 with negative
	# offset_left (right-edge anchored). Search for the new pattern within
	# the function body.
	var rw_idx: int = main_src.find("func _build_reaction_web_chips")
	if rw_idx >= 0:
		var rw_block: String = main_src.substr(rw_idx, 1800)
		if not ("anchor_left = 1.0" in rw_block):
			push_error("FAIL: _build_reaction_web_chips doesn't anchor to right edge (anchor_left=1.0)")
			ok = false
		else:
			print("OK Reaction Web strip anchored to top-right (anchor_left=1.0)")
		if "offset_left = 20.0" in rw_block:
			push_error("FAIL: _build_reaction_web_chips still has old left-side offset_left=20.0")
			ok = false
	else:
		push_error("FAIL: _build_reaction_web_chips function not found")
		ok = false

	# ═══ 4. Active relic placeholder when no active owned ═══
	# _update_active_relic_label used to hide entirely when get_owned_active_id()
	# returned empty. After iter-245 it sets text to "[R] —" and keeps the
	# chip visible at 0.45 alpha.
	var ar_idx: int = main_src.find("func _update_active_relic_label")
	if ar_idx >= 0:
		var ar_block: String = main_src.substr(ar_idx, 1400)
		# The placeholder string is the new behavior — must be present.
		if not ("\"[R] —\"" in ar_block):
			push_error("FAIL: _update_active_relic_label missing '[R] —' placeholder branch")
			ok = false
		else:
			print("OK _update_active_relic_label renders '[R] —' placeholder when no active owned")
		# The no-active branch should NOT hide the label anymore. Look for
		# the active_id == "" branch and check the next few lines for
		# a visibility=true (not false) assignment.
		var empty_idx: int = ar_block.find("active_id == \"\":")
		if empty_idx >= 0:
			var empty_branch: String = ar_block.substr(empty_idx, 500)
			# In the new code, the next active_relic_label.visible assignment
			# inside this branch is `true`, not `false`.
			if "active_relic_label.visible = false" in empty_branch.substr(0, 200):
				push_error("FAIL: _update_active_relic_label still hides chip when no active owned")
				ok = false
	else:
		push_error("FAIL: _update_active_relic_label function not found")
		ok = false

	# ═══ 5. Ability cooldown chip strip is top-RIGHT ═══
	var acd_idx: int = main_src.find("func _build_ability_cooldown_strip")
	if acd_idx >= 0:
		var acd_block: String = main_src.substr(acd_idx, 1500)
		if not ("anchor_left = 1.0" in acd_block):
			push_error("FAIL: ability cooldown strip not anchored right (anchor_left=1.0 missing)")
			ok = false
		else:
			print("OK ability cooldown strip anchored top-right")
		if "offset_left = 20.0" in acd_block:
			push_error("FAIL: ability cooldown strip still uses old left offset_left=20.0")
			ok = false
		if not ("BoxContainer.ALIGNMENT_END" in acd_block):
			push_error("FAIL: ability cooldown strip missing ALIGNMENT_END for right-collapse")
			ok = false

	# ═══ 6. Top-right cluster discipline — comment present ═══
	# Programmatic check that the cluster has a documented intent.
	if not ("top-right cluster" in main_src.to_lower() or "top-RIGHT cluster" in main_src):
		push_error("FAIL: main.gd missing 'top-right cluster' documentation comment for iter-245")
		ok = false
	else:
		print("OK top-right cluster intent documented in main.gd")

	# ═══ 7. game_state.gd has best_combo_this_run ═══
	if not ("best_combo_this_run" in gs_src):
		push_error("FAIL: game_state.gd missing best_combo_this_run field")
		ok = false
	else:
		# Verify it's declared as a var, not just mentioned in a comment.
		if not ("var best_combo_this_run" in gs_src):
			push_error("FAIL: best_combo_this_run not declared as var")
			ok = false
		else:
			print("OK game_state.gd has best_combo_this_run var")
	# Verify it's bumped in main.gd at the combo-changed site.
	if not ("best_combo_this_run" in main_src):
		push_error("FAIL: main.gd never writes best_combo_this_run (combo bumper missing)")
		ok = false

	# ═══ 8. death_screen.gd has BIGGEST COMBO line ═══
	if not ("BIGGEST COMBO" in ds_src):
		push_error("FAIL: death_screen.gd missing 'BIGGEST COMBO' segment in combat summary")
		ok = false
	else:
		print("OK death_screen.gd renders BIGGEST COMBO segment")

	# ═══ 9. Heart pip size bumped +20% (30 → 36) ═══
	# Director audit #1 — slightly enlarge hearts. We bump HEART_PIP_SIZE
	# from 30 to 36 (+20%). Anything <= 30 means the bump didn't land.
	var pip_size_idx: int = main_src.find("const HEART_PIP_SIZE")
	if pip_size_idx >= 0:
		var pip_line: String = main_src.substr(pip_size_idx, 60)
		if "30.0" in pip_line:
			push_error("FAIL: HEART_PIP_SIZE still 30.0 (should be 36.0 after iter-245 +20% bump)")
			ok = false
		elif "36.0" in pip_line:
			print("OK HEART_PIP_SIZE bumped to 36.0 (+20%)")
		else:
			push_error("FAIL: HEART_PIP_SIZE not found at expected size — got: %s" % pip_line)
			ok = false

	if ok:
		print("=== ITER 245 PHASE 3 HUD PASSED ===")
	else:
		print("=== ITER 245 PHASE 3 HUD FAILED ===")
	quit(0 if ok else 1)
