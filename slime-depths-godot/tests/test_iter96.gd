extends SceneTree

# Iter 96 (Phase A) — fix the 6 dead relics.
#
# iter-95 removed the dodge ability but left 6 relics declaring two
# now-no-op modifier keys (`dodge_iframes_bonus_f`, `dodge_cooldown_mul`).
# A 2000-run Monte Carlo sim (sim/relic_sim.py) confirmed those relics
# were essentially never picked. Phase A repurposes each one onto live
# modifier keys, and adds two new dash-strike-anchored keys that hero.gd
# actually reads.
#
# Changes:
#   • New modifier keys: dash_strike_cooldown_mul,
#     dash_strike_post_iframes_bonus_f. Read by hero.gd in
#     _start_dash_strike (cd folding) + iframe extension.
#   • sturdy_step (common): dodge_iframes_bonus_f 0.15 → damage_taken_reduction 1
#   • dodge_master → dash_master (rare): dodge_cooldown_mul -0.3 →
#     dash_strike_cooldown_mul -0.3
#   • gale_step (rare): dodge_iframes_bonus_f 0.1 → dash_strike_post_iframes_bonus_f 0.05,
#     move_speed_mul 0.2 → 0.25
#   • tempest_cloak (rare): dropped dead i-frames mod, bumped two live
#     mods 0.10 → 0.15 each
#   • phantom_step (mythic): kept move_speed, swapped dodge_cooldown_mul
#     → dash_strike_cooldown_mul -0.40, dodge_iframes_bonus_f →
#     dash_strike_post_iframes_bonus_f 0.15
#   • SHADOW theme resonance: dodge_iframes_bonus_f 0.08 →
#     crit_chance_f 0.05 + move_speed_mul 0.05
#   • room_02 lore stone: dodge_iframes_bonus_f → crit_chance_f
func _initialize() -> void:
	var ok := true
	var gs_src := FileAccess.get_file_as_string("res://scripts/game_state.gd")
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")

	# ═══ 1. New modifier keys are READ in hero.gd ═══
	if not hero_src.contains("dash_strike_cooldown_mul"):
		push_error("FAIL: hero.gd doesn't read dash_strike_cooldown_mul (relics that declare it will no-op)")
		ok = false
	else:
		print("OK hero.gd reads dash_strike_cooldown_mul")
	if not hero_src.contains("dash_strike_post_iframes_bonus_f"):
		push_error("FAIL: hero.gd doesn't read dash_strike_post_iframes_bonus_f")
		ok = false
	else:
		print("OK hero.gd reads dash_strike_post_iframes_bonus_f")

	# ═══ 2. Old dead keys NO LONGER declared in any relic mod dict ═══
	# Allow them in comment lines only.
	var lines: PackedStringArray = gs_src.split("\n")
	var dead_decls: int = 0
	for line in lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		# Inside a relic mod dict, the key appears as `"dodge_iframes_bonus_f":`.
		# Surface any such occurrence (not the docstring above the registry).
		if "\"dodge_iframes_bonus_f\":" in line or "\"dodge_cooldown_mul\":" in line:
			# But ALLOW the theme_stat_bonuses function to read the keys
			# from the `out` dict — those reads use string keys too. We
			# filter by checking the line is INSIDE the RELIC_REGISTRY (a
			# heuristic: the line has a leading-spaces indent matching the
			# "mods" lines, AND contains a numeric value not a `.get`).
			if ".get" not in line and "out[" not in line:
				dead_decls += 1
				push_error("FAIL: dead modifier key declared in relic mod dict: %s" % trimmed)
	if dead_decls == 0:
		print("OK no relic mod dict declares the retired dodge_* modifier keys")
	else:
		ok = false

	# ═══ 3. dodge_master renamed → dash_master ═══
	if gs_src.contains("\"dodge_master\":"):
		push_error("FAIL: dodge_master still in registry — should be renamed to dash_master")
		ok = false
	elif not gs_src.contains("\"dash_master\":"):
		push_error("FAIL: dash_master not in registry")
		ok = false
	else:
		print("OK dodge_master renamed to dash_master")

	# ═══ 4. Specific relic mods match the retune ═══
	# sturdy_step: damage_taken_reduction 1
	var idx: int = gs_src.find("\"sturdy_step\":")
	if idx < 0:
		push_error("FAIL: sturdy_step missing")
		ok = false
	else:
		var s: String = gs_src.substr(idx, 400)
		if not s.contains("\"damage_taken_reduction\": 1"):
			push_error("FAIL: sturdy_step doesn't have damage_taken_reduction:1")
			ok = false
		else:
			print("OK sturdy_step now grants damage_taken_reduction:1 (was DEAD dodge_iframes_bonus_f)")
	# dash_master: dash_strike_cooldown_mul -0.3
	idx = gs_src.find("\"dash_master\":")
	if idx >= 0:
		var s: String = gs_src.substr(idx, 400)
		if not s.contains("\"dash_strike_cooldown_mul\": -0.3"):
			push_error("FAIL: dash_master doesn't have dash_strike_cooldown_mul:-0.3")
			ok = false
		else:
			print("OK dash_master grants dash_strike_cooldown_mul:-0.3")
	# phantom_step: 3 mods on dash strike + move speed
	idx = gs_src.find("\"phantom_step\":")
	if idx >= 0:
		var s: String = gs_src.substr(idx, 600)
		var all_present: bool = (
			s.contains("\"move_speed_mul\": 0.50")
			and s.contains("\"dash_strike_cooldown_mul\": -0.40")
			and s.contains("\"dash_strike_post_iframes_bonus_f\": 0.15")
		)
		if not all_present:
			push_error("FAIL: phantom_step mythic doesn't have the 3 expected live mods")
			ok = false
		else:
			print("OK phantom_step mythic has 3 live mods (no longer 2-of-3 dead)")

	# ═══ 5. SHADOW resonance grants live mods ═══
	idx = gs_src.find("if theme_tier(\"shadow\") >= 1:")
	if idx < 0:
		push_error("FAIL: SHADOW resonance branch missing from theme_stat_bonuses")
		ok = false
	else:
		var s: String = gs_src.substr(idx, 400)
		if "dodge_iframes_bonus_f" in s:
			push_error("FAIL: SHADOW resonance still grants the DEAD dodge_iframes_bonus_f key")
			ok = false
		elif not (s.contains("crit_chance_f") and s.contains("move_speed_mul")):
			push_error("FAIL: SHADOW resonance doesn't grant the new live mods")
			ok = false
		else:
			print("OK SHADOW resonance grants crit_chance_f + move_speed_mul (live keys)")

	# ═══ 6. Lore stone in room_02 no longer uses dead key ═══
	var rm2_src := FileAccess.get_file_as_string("res://scenes/rooms/room_02.tres")
	if "dodge_iframes_bonus_f" in rm2_src:
		push_error("FAIL: room_02.tres lore stone still grants the dead dodge_iframes_bonus_f key")
		ok = false
	else:
		print("OK room_02.tres lore stones use live stat keys only")

	# ═══ 7. hero.gd folds the new modifier keys into the live values ═══
	# Static check that the cooldown line + iframes line both call
	# modifier_total_f with the new keys. Runtime test deferred — autoload
	# resolution from test --script context is finicky in Godot 4.6.
	if not hero_src.contains("modifier_total_f(\"dash_strike_cooldown_mul\""):
		push_error("FAIL: hero.gd doesn't call modifier_total_f for dash_strike_cooldown_mul")
		ok = false
	else:
		print("OK hero.gd folds dash_strike_cooldown_mul into _dash_strike_cd")
	if not hero_src.contains("modifier_total_f(\"dash_strike_post_iframes_bonus_f\""):
		push_error("FAIL: hero.gd doesn't call modifier_total_f for dash_strike_post_iframes_bonus_f")
		ok = false
	else:
		print("OK hero.gd folds dash_strike_post_iframes_bonus_f into _iframes window")

	# ═══ 8. Phase B — new crit_damage_bonus_f modifier read in hero.gd ═══
	if not hero_src.contains("modifier_total_f(\"crit_damage_bonus_f\""):
		push_error("FAIL: hero.gd doesn't fold crit_damage_bonus_f at any CRIT_DAMAGE_MUL site")
		ok = false
	else:
		print("OK hero.gd folds crit_damage_bonus_f into the crit damage formula")

	# ═══ 9. Phase B retuned relics — each new mod must be in place ═══
	var phase_b_checks: Array = [
		# (relic, must-contain-substring-in-its-stanza, label)
		["iron_grip",       "\"damage_taken_reduction\": 1",  "iron_grip gained -1 DR (was knockback-only at 0.1% pick rate)"],
		["iron_will",       "\"max_hp_bonus\": 2",            "iron_will bumped to +2 HP (was +1 with lying description)"],
		["lifestone",       "Every 8 kills",                  "lifestone gained every-8-kills regen description"],
		["keen_focus",      "\"crit_damage_bonus_f\": 0.10",  "keen_focus gained +10% crit damage"],
		["arcane_quiver",   "\"pierce_count\": 1",            "arcane_quiver gained pierce_count (was speed-only at 2.2%)"],
		["long_reach",      "\"sword_damage_bonus\": 1",      "long_reach gained +1 sword damage (was reach-only at 3.2%)"],
		["heart_of_stone",  "\"max_hp_bonus\": 3",            "heart_of_stone bumped to +3 HP (was strictly worse than aegis_plate)"],
	]
	for entry in phase_b_checks:
		var rid: String = entry[0]
		var needle: String = entry[1]
		var label: String = entry[2]
		var r_idx: int = gs_src.find("\"%s\":" % rid)
		if r_idx < 0:
			push_error("FAIL: %s missing from registry" % rid)
			ok = false
			continue
		var slice: String = gs_src.substr(r_idx, 500)
		if needle not in slice:
			push_error("FAIL: %s — needle '%s' not in registry stanza" % [rid, needle])
			ok = false
		else:
			print("OK %s" % label)

	# ═══ 10. Phase B — lifestone regen handler in hero.gd ═══
	# The handler fires on enemy_died via the existing kill_counter path.
	# Look for a `has_relic("lifestone")` + `_kill_counter % 8` block.
	if not (hero_src.contains("has_relic(\"lifestone\")") and hero_src.contains("_kill_counter % 8")):
		push_error("FAIL: hero.gd missing lifestone every-8-kills regen handler")
		ok = false
	else:
		print("OK hero.gd has lifestone every-8-kills regen handler")

	# ═══ 11. Phase B — second_wind i-frames bumped 2.0 → 2.5 ═══
	if not hero_src.contains("HIT_IFRAMES * 2.5"):
		push_error("FAIL: second_wind i-frames not bumped (looking for HIT_IFRAMES * 2.5)")
		ok = false
	else:
		print("OK second_wind post-revive i-frames bumped (1.1s → 1.4s)")

	if ok:
		print("=== ITER 96 INTEGRATION PASSED ===")
	else:
		print("=== ITER 96 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
