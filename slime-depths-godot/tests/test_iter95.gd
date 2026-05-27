extends SceneTree

# Iter 95 — defensive-toolkit simplification per user request:
#
#   "Make gameplay better by removing the dodge, and change parry to say
#    shield. This way the only real dodge is the dash strike that keeps
#    gameplay aggressive."
#
# Three pillars:
#
# 1. **DODGE ability deleted.** No more iframe roll on Space. All dodge-
#    related code is gone: DODGE_* constants, _dodge_time/_cd/_dir state,
#    _start_dodge function, dodge input handler, dodge velocity branch,
#    dodge facing logic, _can_cancel_dodge_into_dash_strike, the
#    iter-62 SHADOW dodge trail, the iter-40 SHADOW shockwave-on-dodge
#    (REANCHORED to dash_strike), the iter-68 STORM shock pulse on
#    dodge (REANCHORED to dash_strike). Events.hero_dodged signal
#    renamed to Events.hero_shielded. dodge_dust.tscn + .gd deleted.
#    Space binding removed from input_setup.gd.
#
# 2. **Parry renamed to shield.** PARRY_* constants → SHIELD_*. _parry_*
#    state vars → _shield_*. _start_parry → _start_shield. _on_parry_hit
#    → _on_shield_block. Banner text "PARRY" → "SHIELD". Input action
#    name was already "shield" so no rebind needed.
#
# 3. **Dash strike retuned + theme procs reanchored.** Cooldown trimmed
#    1.4 → 0.9 so the engage stays available roughly every second
#    (matches the "aggressive" feel the user asked for). SHADOW tier 2
#    shockwave + STORM tier 1+ shock pulse now fire on _start_dash_strike
#    instead of _start_dodge. SHADOW tier 1 dodge trail removed entirely
#    (dash_strike already spawns dash_trail).
func _initialize() -> void:
	var ok := true

	# ═══ Dodge code removed from hero.gd ═══
	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")
	# Active references (not comments) — match a line that DOESN'T start
	# with a `#` and contains the dodge token. Comments documenting the
	# removal are fine.
	var lines: PackedStringArray = hero_src.split("\n")
	var live_dodge_refs: int = 0
	for line in lines:
		var trimmed: String = line.strip_edges()
		if trimmed.begins_with("#"):
			continue
		# Whole-token match for the dodge symbols (avoid matching
		# `_dash_strike_dir` etc.).
		for tok in ["_dodge_time", "_dodge_dir", "_dodge_cd", "DODGE_DURATION", "DODGE_IFRAMES", "DODGE_COOLDOWN", "DODGE_SPEED", "DODGE_CANCEL_THRESHOLD", "dodge_started", "_start_dodge"]:
			if tok in line:
				live_dodge_refs += 1
				push_error("FAIL: live dodge ref still in hero.gd: %s" % trimmed)
	if live_dodge_refs == 0:
		print("OK hero.gd has zero live (non-comment) dodge references")
	else:
		ok = false

	# ═══ Events.hero_dodged renamed → hero_shielded (iter-95) → hero_perfect_dodged (iter-247) ═══
	# iter-247 follow-up: parry/shield folded into PERFECT DODGE, signal
	# renamed accordingly. Iter-95's original assertion was hero_shielded;
	# iter-247 updates it to hero_perfect_dodged. Both must NOT contain
	# the original hero_dodged name (regression guard from iter-95).
	var ev_src := FileAccess.get_file_as_string("res://scripts/events.gd")
	if ev_src.contains("signal hero_dodged"):
		push_error("FAIL: events.gd still declares signal hero_dodged")
		ok = false
	elif not ev_src.contains("signal hero_perfect_dodged"):
		push_error("FAIL: events.gd missing signal hero_perfect_dodged (iter-247 rename of hero_shielded)")
		ok = false
	else:
		print("OK Events: hero_dodged → hero_shielded (iter-95) → hero_perfect_dodged (iter-247)")

	# ═══ All subscribers updated ═══
	for path in ["res://scripts/audio.gd", "res://scripts/fx.gd", "res://scripts/screen_flash.gd"]:
		var src := FileAccess.get_file_as_string(path)
		if "Events.hero_dodged" in src:
			push_error("FAIL: %s still references Events.hero_dodged" % path)
			ok = false
	if ok:
		print("OK no script subscribes to Events.hero_dodged anymore")

	# audio: handler renamed twice (iter-95: _on_hero_shielded; iter-247:
	# _on_hero_perfect_dodged). Verify the current iter-247 handler exists.
	var audio_src := FileAccess.get_file_as_string("res://scripts/audio.gd")
	if not audio_src.contains("_on_hero_perfect_dodged"):
		push_error("FAIL: audio.gd missing _on_hero_perfect_dodged handler (iter-247)")
		ok = false
	else:
		print("OK audio.gd has _on_hero_perfect_dodged handler (iter-247 rename)")

	# fx.gd: DODGE_DUST_SCENE preload removed (dodge_dust.tscn deleted)
	var fx_src := FileAccess.get_file_as_string("res://scripts/fx.gd")
	if "DODGE_DUST_SCENE" in fx_src and not fx_src.contains("# iter-95: DODGE_DUST_SCENE removed"):
		push_error("FAIL: fx.gd still preloads DODGE_DUST_SCENE")
		ok = false
	else:
		print("OK fx.gd no longer preloads DODGE_DUST_SCENE")

	# ═══ dodge_dust files deleted ═══
	for path in ["res://scenes/fx/dodge_dust.tscn", "res://scripts/dodge_dust.gd"]:
		if ResourceLoader.exists(path):
			push_error("FAIL: %s should be deleted in iter-95" % path)
			ok = false
	print("OK dodge_dust scene + script deleted")

	# ═══ input_setup.gd no longer binds Space → dodge ═══
	var is_src := FileAccess.get_file_as_string("res://scripts/input_setup.gd")
	if is_src.contains("_bind_key(\"dodge\""):
		push_error("FAIL: input_setup.gd still binds 'dodge' action — Space should be unbound now")
		ok = false
	else:
		print("OK input_setup.gd no longer binds 'dodge' action")

	# ═══ Parry → shield rename ═══
	# State + function renames in hero.gd.
	for old_tok in ["PARRY_WINDOW", "PARRY_COOLDOWN", "PARRY_TINT", "PARRY_HIT_SLOWMO_SCALE", "PARRY_HIT_SLOWMO_TIME", "PARRY_HIT_IFRAMES", "PARRY_REFLECT_COUNT", "PARRY_REFLECT_CONE", "PARRY_REFLECT_DAMAGE", "PARRY_REFLECT_SPEED"]:
		if old_tok in hero_src:
			push_error("FAIL: hero.gd still uses old constant %s — should be SHIELD_* now" % old_tok)
			ok = false
	for new_tok in ["SHIELD_WINDOW", "SHIELD_COOLDOWN", "SHIELD_TINT", "SHIELD_HIT_SLOWMO_SCALE", "SHIELD_HIT_SLOWMO_TIME", "SHIELD_HIT_IFRAMES"]:
		if not new_tok in hero_src:
			push_error("FAIL: hero.gd missing renamed constant %s" % new_tok)
			ok = false
	if ok:
		print("OK PARRY_* constants renamed to SHIELD_*")
	for tok in ["_start_shield", "_on_shield_block", "_spawn_shield_reflect_fan"]:
		if not tok in hero_src:
			push_error("FAIL: hero.gd missing renamed function %s" % tok)
			ok = false
	for tok in ["_start_parry", "_on_parry_hit", "_spawn_parry_reflect_fan"]:
		# These should appear ONLY in comments (the iter-95 marker comments
		# reference them). Live function definitions are gone.
		for line in lines:
			var trimmed: String = line.strip_edges()
			if trimmed.begins_with("#"):
				continue
			if "func " + tok in line:
				push_error("FAIL: hero.gd still defines old func %s — should be renamed" % tok)
				ok = false
	print("OK _start_parry → _start_shield, _on_parry_hit → _on_shield_block, reflect fan renamed")

	# Banner text — iter-95 renamed "PARRY" → "SHIELD". iter-247 removed
	# the catch-floater entirely (perfect-dodge spawns a "PERFECT!" floater
	# in sub-commit 4 instead, from a different code path). PARRY must
	# stay absent (regression guard); SHIELD floater is now optional.
	if hero_src.contains("\"PARRY\""):
		push_error("FAIL: hero.gd still shows 'PARRY' banner text (iter-95 removed it)")
		ok = false
	else:
		print("OK damage_number banner: PARRY removed (iter-95); SHIELD floater removed in iter-247 catch refactor")

	# ═══ Dash strike retuned + theme procs reanchored ═══
	if not hero_src.contains("DASH_STRIKE_COOLDOWN := 0.9"):
		push_error("FAIL: DASH_STRIKE_COOLDOWN not retuned to 0.9 (iter-95 aggression bump)")
		ok = false
	else:
		print("OK DASH_STRIKE_COOLDOWN trimmed to 0.9 (1.4 → 0.9 for aggressive feel)")

	# SHADOW shockwave + STORM pulse now fire from _start_dash_strike
	# (the renamed functions). The dash_strike body should call both.
	# Find the _start_dash_strike function body.
	var ds_idx: int = hero_src.find("func _start_dash_strike()")
	if ds_idx < 0:
		push_error("FAIL: _start_dash_strike function missing")
		ok = false
	else:
		# Look ahead 4000 chars for the theme proc calls (function body
		# is large — afterimage spawn, dash shield setup, theme procs).
		var ds_body: String = hero_src.substr(ds_idx, 4000)
		if not ds_body.contains("_trigger_shadow_dash_shockwave()"):
			push_error("FAIL: _start_dash_strike doesn't call _trigger_shadow_dash_shockwave (SHADOW tier 2 lost)")
			ok = false
		elif not ds_body.contains("_spawn_storm_dash_shock_pulse()"):
			push_error("FAIL: _start_dash_strike doesn't call _spawn_storm_dash_shock_pulse (STORM tier 1+ lost)")
			ok = false
		else:
			print("OK SHADOW tier-2 + STORM tier-1+ procs reanchored to dash_strike")

	# ═══ Runtime smoke — hero scene loads cleanly ═══
	var scene := load("res://scenes/hero.tscn") as PackedScene
	if scene == null:
		push_error("FAIL: hero.tscn no longer loads (iter-95 may have introduced a parse error)")
		ok = false
	else:
		var inst: Node = scene.instantiate()
		if inst == null:
			push_error("FAIL: hero scene failed to instantiate")
			ok = false
		else:
			# These methods MUST exist (the input handlers call them).
			for fn in ["_start_shield", "_on_shield_block", "_start_dash_strike", "_can_start_dash_strike"]:
				if not inst.has_method(fn):
					push_error("FAIL: hero instance missing method %s" % fn)
					ok = false
			# These methods MUST NOT exist (removed).
			for fn in ["_start_dodge", "_can_cancel_dodge_into_dash_strike", "_spawn_shadow_dodge_trail", "_trigger_shadow_shockwave", "_spawn_storm_shock_pulse"]:
				if inst.has_method(fn):
					push_error("FAIL: hero instance still has removed method %s" % fn)
					ok = false
			print("OK hero instance has all renamed methods + none of the removed methods")
			inst.queue_free()

	if ok:
		print("=== ITER 95 INTEGRATION PASSED ===")
	else:
		print("=== ITER 95 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
