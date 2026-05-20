extends SceneTree

# Iter 231 / Fun Ideas Team R2 — REACTION WEB combo-chip smoke test.
#
# The Reaction Web is a HUD chip strip that mirrors, for each of the 6
# automatic status combos (SHATTER / KINDLE_SPREAD / PETRIFY /
# SCATTER_FLAMES / BACKDRAFT / RIME_TRAIL), whether the player's current
# relic build can produce BOTH halves of the trigger.
#
# This test verifies:
#   1. ReactionWeb.COMBO_REQUIREMENTS dict declares ALL 6 expected
#      combos.
#   2. Each combo entry has the expected predicate shape — kind_a +
#      kind_b + label + theme. Both kinds must be in the canonical
#      KNOWN_KINDS list so a typo can't silently always-return-false
#      from is_capability_active().
#   3. ReactionWeb.evaluate_combo behaves correctly under a fresh
#      GameState (no relics) → all combos return "unarmable" for the
#      chance-gated halves, while built-in combos like KINDLE_SPREAD
#      (burn + kill) and BACKDRAFT (burn + parry) stay un-armed since
#      burn is still unavailable.
#   4. After modifier_total_f returns positive for burn_chance_f
#      (simulated by setting a memory mod), the burn-gated combos
#      transition to "armed" (for KINDLE / SCATTER / BACKDRAFT where
#      the second half is always-on) or "partial" (SHATTER, which
#      additionally needs slow).
#   5. main.gd source-grep — _build_reaction_web_chips +
#      _update_reaction_web exist as funcs and are wired from _ready +
#      _process.
#
# Test pattern follows test_iter227_pact_altar.gd — source-inspect smoke
# tests + autoload data sanity. We do NOT instantiate the main.tscn HUD
# scene (that needs the full autoload + room config stack).

func _initialize() -> void:
	print("[funideas231] init")
	await process_frame
	# ── 1. ReactionWeb script loads + COMBO_REQUIREMENTS shape ────────
	var rw_script: Script = load("res://scripts/reaction_web.gd") as Script
	if rw_script == null:
		printerr("FAIL: reaction_web.gd failed to load")
		quit(1)
		return
	var requirements: Dictionary = rw_script.get("COMBO_REQUIREMENTS")
	var known_kinds: Array = rw_script.get("KNOWN_KINDS")
	if requirements == null:
		printerr("FAIL: ReactionWeb.COMBO_REQUIREMENTS is null")
		quit(1)
		return
	if known_kinds == null:
		printerr("FAIL: ReactionWeb.KNOWN_KINDS is null")
		quit(1)
		return
	# All 6 expected combos present.
	var expected_combos: Array = [
		"shatter", "kindle_spread", "petrify",
		"scatter_flames", "backdraft", "rime_trail",
	]
	for cid in expected_combos:
		if not requirements.has(cid):
			printerr("FAIL: COMBO_REQUIREMENTS missing combo '%s'" % cid)
			quit(1)
			return
	if requirements.size() != expected_combos.size():
		printerr(
			"FAIL: COMBO_REQUIREMENTS has %d entries, expected %d"
			% [requirements.size(), expected_combos.size()]
		)
		quit(1)
		return
	print("[funideas231] COMBO_REQUIREMENTS has all 6 combos")
	# Each combo entry has the expected predicate shape.
	for cid in expected_combos:
		var spec: Dictionary = requirements[cid] as Dictionary
		for key in ["label", "theme", "kind_a", "kind_b"]:
			if not spec.has(key):
				printerr("FAIL: combo '%s' missing key '%s'" % [cid, key])
				quit(1)
				return
		var ka: String = str(spec["kind_a"])
		var kb: String = str(spec["kind_b"])
		# Both kinds must be in KNOWN_KINDS — otherwise the chip is
		# permanently unarmable from a silent typo.
		if not (ka in known_kinds):
			printerr(
				"FAIL: combo '%s' kind_a '%s' not in KNOWN_KINDS"
				% [cid, ka]
			)
			quit(1)
			return
		if not (kb in known_kinds):
			printerr(
				"FAIL: combo '%s' kind_b '%s' not in KNOWN_KINDS"
				% [cid, kb]
			)
			quit(1)
			return
		# label is a non-empty string.
		if str(spec["label"]).length() == 0:
			printerr("FAIL: combo '%s' has empty label" % cid)
			quit(1)
			return
	print("[funideas231] every combo has label + theme + kind_a + kind_b in KNOWN_KINDS")
	# Spot-check the canonical mappings against the spec in the task
	# brief. If someone swaps kind_a/kind_b in the dict the chip would
	# still arm correctly (the predicate is symmetric AND), but the
	# missing_kind hint would tell the player to grab the WRONG relic
	# family, so the order matters for UX.
	var pairs: Dictionary = {
		"shatter": ["burn", "slow"],
		"kindle_spread": ["burn", "kill"],
		"petrify": ["slow", "crit"],
		"scatter_flames": ["burn", "knockback"],
		"backdraft": ["burn", "parry"],
		"rime_trail": ["slow", "dash"],
	}
	for cid in pairs.keys():
		var spec_p: Dictionary = requirements[cid] as Dictionary
		var want: Array = pairs[cid]
		if str(spec_p["kind_a"]) != str(want[0]) or str(spec_p["kind_b"]) != str(want[1]):
			printerr(
				"FAIL: combo '%s' kind pair mismatch — got (%s,%s) expected (%s,%s)"
				% [cid, str(spec_p["kind_a"]), str(spec_p["kind_b"]), str(want[0]), str(want[1])]
			)
			quit(1)
			return
	print("[funideas231] canonical kind pairs match brief")
	# ── 2. evaluate_combo + missing_kind behavior under fresh GS ──────
	var gs_node: Node = Engine.get_main_loop().root.get_node_or_null("/root/GameState")
	if gs_node == null:
		printerr("FAIL: /root/GameState autoload missing")
		quit(1)
		return
	# Snapshot + reset the relevant state so we don't poison subsequent
	# tests. The autoload persists between SceneTree-script runs in the
	# same headless invocation, but each test invocation is a fresh
	# process so reset is mostly defensive.
	gs_node.set("owned_relics", [])
	gs_node.set("owned_active_id", "")
	# Clear memory_mods + run_modifiers fields if they exist (they
	# accumulate burn_chance_f from memories / curses).
	if "memory_mods" in gs_node:
		gs_node.set("memory_mods", {})
	if "shrine_bonuses" in gs_node:
		gs_node.set("shrine_bonuses", {})
	# Fresh build: combos where BOTH halves are chance-gated (SHATTER →
	# burn + slow, PETRIFY → slow + crit) are fully unarmable. Combos
	# with an always-on second half (KINDLE_SPREAD / SCATTER_FLAMES /
	# BACKDRAFT need burn, RIME_TRAIL needs slow) show as PARTIAL — the
	# chip surfaces "needs BURN" / "needs SLOW" so the player knows
	# which relic family unlocks each combo even before picking one up.
	# This is the design call: educational chips beat invisible chips.
	var expected_states_fresh: Dictionary = {
		"shatter": "unarmable",
		"petrify": "unarmable",
		"kindle_spread": "partial",
		"scatter_flames": "partial",
		"backdraft": "partial",
		"rime_trail": "partial",
	}
	for cid in expected_combos:
		var state: String = rw_script.call("evaluate_combo", cid, gs_node)
		var want_state: String = str(expected_states_fresh[cid])
		if state != want_state:
			printerr(
				"FAIL: fresh GS '%s' should be %s, got '%s'"
				% [cid, want_state, state]
			)
			quit(1)
			return
	# Sanity: fresh-GS partial chips report the chance-gated kind as
	# missing (player wants to grab a burn relic to unlock KINDLE etc).
	if str(rw_script.call("missing_kind", "kindle_spread", gs_node)) != "burn":
		printerr("FAIL: fresh KINDLE missing_kind should be 'burn'")
		quit(1)
		return
	if str(rw_script.call("missing_kind", "rime_trail", gs_node)) != "slow":
		printerr("FAIL: fresh RIME missing_kind should be 'slow'")
		quit(1)
		return
	print("[funideas231] fresh GS partials report correct missing kinds")
	# Give the player an embers_of_ruin equivalent — burn_chance_f > 0.
	# Push it through owned_relics so theme_count / modifier_total_f
	# both pick it up. embers_of_ruin grants 0.25 burn_chance_f.
	var owned: Array = gs_node.get("owned_relics") as Array
	owned.append("embers_of_ruin")
	gs_node.set("owned_relics", owned)
	# Burn capability should now register.
	if not bool(rw_script.call("is_capability_active", "burn", gs_node)):
		printerr("FAIL: burn capability not active after embers_of_ruin pick")
		quit(1)
		return
	# Slow / crit still un-armed (no relic source).
	if bool(rw_script.call("is_capability_active", "slow", gs_node)):
		printerr("FAIL: slow capability should still be inactive")
		quit(1)
		return
	# Built-in always-on kinds.
	for builtin in ["kill", "knockback", "parry", "dash"]:
		if not bool(rw_script.call("is_capability_active", builtin, gs_node)):
			printerr("FAIL: built-in capability '%s' not active" % builtin)
			quit(1)
			return
	# Combos with burn + always-on second half should arm fully.
	for armed_cid in ["kindle_spread", "scatter_flames", "backdraft"]:
		var s: String = rw_script.call("evaluate_combo", armed_cid, gs_node)
		if s != "armed":
			printerr(
				"FAIL: after burn pick '%s' should be armed, got '%s'"
				% [armed_cid, s]
			)
			quit(1)
			return
	# SHATTER → partial (burn yes, slow no). PETRIFY → unarmable
	# (slow no, crit no — both halves still missing). RIME → still
	# partial (slow no, dash always on — needs slow). Note RIME stayed
	# partial pre-burn-pick too since dash is always on; the burn pick
	# doesn't change its state.
	if str(rw_script.call("evaluate_combo", "shatter", gs_node)) != "partial":
		printerr("FAIL: SHATTER should be partial after burn-only pick")
		quit(1)
		return
	if str(rw_script.call("missing_kind", "shatter", gs_node)) != "slow":
		printerr("FAIL: SHATTER missing_kind should be 'slow'")
		quit(1)
		return
	if str(rw_script.call("evaluate_combo", "petrify", gs_node)) != "unarmable":
		printerr("FAIL: PETRIFY should be unarmable (no slow / no crit)")
		quit(1)
		return
	# RIME_TRAIL only depends on slow + dash. Dash is always on, slow
	# still missing → partial. Burn-pick does NOT touch it.
	if str(rw_script.call("evaluate_combo", "rime_trail", gs_node)) != "partial":
		printerr("FAIL: RIME_TRAIL should be partial (dash on, slow missing)")
		quit(1)
		return
	if str(rw_script.call("missing_kind", "rime_trail", gs_node)) != "slow":
		printerr("FAIL: RIME_TRAIL missing_kind should be 'slow'")
		quit(1)
		return
	print("[funideas231] burn-only build arms 3, partials SHATTER + RIME, hides PETRIFY")
	# Reset for cleanliness.
	gs_node.set("owned_relics", [])
	# ── 3. main.gd source-inspect for chip strip wiring ───────────────
	var main_script: Script = load("res://scripts/main.gd") as Script
	if main_script == null:
		printerr("FAIL: main.gd failed to load")
		quit(1)
		return
	var main_src: String = main_script.source_code
	var required: Array = [
		"_build_reaction_web_chips",
		"_update_reaction_web",
	]
	for h in required:
		if main_src.find("func " + h) < 0:
			printerr("FAIL: main.gd missing helper %s" % h)
			quit(1)
			return
	if main_src.find("_build_reaction_web_chips()") < 0:
		printerr("FAIL: main.gd never calls _build_reaction_web_chips()")
		quit(1)
		return
	if main_src.find("_update_reaction_web()") < 0:
		printerr("FAIL: main.gd never calls _update_reaction_web()")
		quit(1)
		return
	if main_src.find("_reaction_web_strip") < 0:
		printerr("FAIL: main.gd missing _reaction_web_strip state")
		quit(1)
		return
	if main_src.find("_reaction_web_chips") < 0:
		printerr("FAIL: main.gd missing _reaction_web_chips state")
		quit(1)
		return
	print("[funideas231] main.gd chip strip wiring OK")
	print("[funideas231] PASS")
	quit(0)
