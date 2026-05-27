extends SceneTree

# iter-250 — dodge retune + perfect-dodge mechanic.
#
# Verifies the dodge refactor in sub-commit 4:
#   1. Retune constants at the design spec.
#   2. Perfect-dodge constants present.
#   3. State vars (_dodge_active_time, _perfect_dodge_buffer) declared.
#   4. _physics_process increments _dodge_active_time during dash;
#      decrements _perfect_dodge_buffer.
#   5. take_damage has the perfect-dodge detection branch.
#   6. _trigger_perfect_dodge helper exists + emits the signal +
#      calls VOW payoff + BACKDRAFT trigger.
#   7. _resolve_melee_strike consumes the buffer on first connect
#      (+50% damage, forced crit).
#   8. Mid-dodge attack penalty: input handler zeros i-frames +
#      ends dash when LMB pressed during dash.
#   9. _start_dash_strike resets _dodge_active_time.

func _initialize() -> void:
	print("[iter250perfectdodge] init")
	await process_frame
	var ok := true

	var hero_src: String = FileAccess.get_file_as_string("res://scripts/hero.gd")
	if hero_src.is_empty():
		printerr("FAIL: hero.gd unreadable")
		quit(1)
		return

	# ── 1. Retune constants ───────────────────────────────────────────
	if hero_src.find("const DASH_STRIKE_SPEED    := 580.0") < 0:
		printerr("FAIL: DASH_STRIKE_SPEED not retuned to 580.0 (was 600.0)")
		ok = false
	else:
		print("[iter250perfectdodge] DASH_STRIKE_SPEED = 580.0 OK")
	if hero_src.find("const DASH_STRIKE_DURATION := 0.24") < 0:
		printerr("FAIL: DASH_STRIKE_DURATION not retuned to 0.24 (was 0.28)")
		ok = false
	else:
		print("[iter250perfectdodge] DASH_STRIKE_DURATION = 0.24 OK")
	if hero_src.find("const DASH_STRIKE_COOLDOWN := 0.6") < 0:
		printerr("FAIL: DASH_STRIKE_COOLDOWN not retuned to 0.6 (was 0.9)")
		ok = false
	else:
		print("[iter250perfectdodge] DASH_STRIKE_COOLDOWN = 0.6 OK")

	# ── 2. Perfect-dodge constants ────────────────────────────────────
	var required_consts: Array = [
		"PERFECT_DODGE_WINDOW",
		"PERFECT_DODGE_BUFFER_TIME",
		"PERFECT_DODGE_DAMAGE_MUL",
		"PERFECT_DODGE_KNOCKBACK_MUL",
		"PERFECT_DODGE_SLOWMO_SCALE",
		"PERFECT_DODGE_SLOWMO_HOLD",
		"PERFECT_DODGE_SLOWMO_EASE",
		"PERFECT_DODGE_TINT",
	]
	for c in required_consts:
		if hero_src.find("const " + c) < 0:
			printerr("FAIL: hero.gd missing const %s" % c)
			ok = false
		else:
			print("[iter250perfectdodge] const %s present" % c)
	# Verify the design-spec values.
	if hero_src.find("const PERFECT_DODGE_WINDOW: float = 0.10") < 0:
		printerr("FAIL: PERFECT_DODGE_WINDOW != 0.10 (design spec violated)")
		ok = false
	if hero_src.find("const PERFECT_DODGE_BUFFER_TIME: float = 1.5") < 0:
		printerr("FAIL: PERFECT_DODGE_BUFFER_TIME != 1.5 (design spec violated)")
		ok = false
	if hero_src.find("const PERFECT_DODGE_DAMAGE_MUL: float = 1.5") < 0:
		printerr("FAIL: PERFECT_DODGE_DAMAGE_MUL != 1.5 (design spec violated)")
		ok = false
	if hero_src.find("const PERFECT_DODGE_SLOWMO_SCALE: float = 0.40") < 0:
		printerr("FAIL: PERFECT_DODGE_SLOWMO_SCALE != 0.40 (design spec violated)")
		ok = false
	print("[iter250perfectdodge] perfect-dodge constants at design spec")

	# ── 3. State vars ─────────────────────────────────────────────────
	var required_vars: Array = [
		"_dodge_active_time",
		"_perfect_dodge_buffer",
	]
	for v in required_vars:
		if hero_src.find("var " + v) < 0:
			printerr("FAIL: hero.gd missing var %s" % v)
			ok = false
		else:
			print("[iter250perfectdodge] var %s present" % v)

	# ── 4. _physics_process increments + decrements ──────────────────
	if hero_src.find("_dodge_active_time += delta") < 0:
		printerr("FAIL: _physics_process does not increment _dodge_active_time")
		ok = false
	else:
		print("[iter250perfectdodge] _dodge_active_time accumulates during dash")
	if hero_src.find("_perfect_dodge_buffer = max(0.0, _perfect_dodge_buffer - delta)") < 0:
		printerr("FAIL: _physics_process does not decrement _perfect_dodge_buffer")
		ok = false
	else:
		print("[iter250perfectdodge] _perfect_dodge_buffer decays each frame")

	# ── 5. take_damage detection branch ───────────────────────────────
	# Spec: detect window when _dodge_active_time >= (DURATION - WINDOW).
	if hero_src.find("_dodge_active_time >= (DASH_STRIKE_DURATION - PERFECT_DODGE_WINDOW)") < 0:
		printerr("FAIL: take_damage missing perfect-dodge timing check")
		ok = false
	else:
		print("[iter250perfectdodge] take_damage detects perfect-dodge window")
	if hero_src.find("_trigger_perfect_dodge(") < 0:
		printerr("FAIL: take_damage doesn't call _trigger_perfect_dodge")
		ok = false
	else:
		print("[iter250perfectdodge] _trigger_perfect_dodge wired from take_damage")

	# ── 6. _trigger_perfect_dodge helper ──────────────────────────────
	if hero_src.find("func _trigger_perfect_dodge") < 0:
		printerr("FAIL: missing _trigger_perfect_dodge helper")
		ok = false
	else:
		print("[iter250perfectdodge] _trigger_perfect_dodge helper present")
	# Buffer arm.
	if hero_src.find("_perfect_dodge_buffer = PERFECT_DODGE_BUFFER_TIME") < 0:
		printerr("FAIL: _trigger_perfect_dodge doesn't arm buffer")
		ok = false
	# Slow-mo via Engine.time_scale.
	if hero_src.find("Engine.time_scale = PERFECT_DODGE_SLOWMO_SCALE") < 0:
		printerr("FAIL: _trigger_perfect_dodge doesn't trigger slow-mo")
		ok = false
	else:
		print("[iter250perfectdodge] slow-mo triggered on perfect-dodge")
	# Signal emit.
	if hero_src.find("Events.hero_perfect_dodged.emit") < 0:
		printerr("FAIL: _trigger_perfect_dodge doesn't emit hero_perfect_dodged")
		ok = false
	else:
		print("[iter250perfectdodge] hero_perfect_dodged signal emitted")
	# VOW payoff call.
	if hero_src.find("_perfect_dodge_vow_payoff()") < 0:
		printerr("FAIL: _trigger_perfect_dodge doesn't call _perfect_dodge_vow_payoff")
		ok = false
	else:
		print("[iter250perfectdodge] VOW payoff wired from perfect-dodge")
	# BACKDRAFT trigger.
	if hero_src.find("_try_trigger_backdraft()") < 0:
		printerr("FAIL: _trigger_perfect_dodge doesn't call _try_trigger_backdraft")
		ok = false
	else:
		print("[iter250perfectdodge] BACKDRAFT trigger wired from perfect-dodge")
	# PERFECT! floater.
	if hero_src.find("\"PERFECT!\"") < 0:
		printerr("FAIL: no PERFECT! floater spawned")
		ok = false
	else:
		print("[iter250perfectdodge] PERFECT! floater present")
	# Audio chime.
	if hero_src.find("perfect_dodge_chime") < 0:
		printerr("FAIL: perfect_dodge_chime audio not played")
		ok = false
	else:
		print("[iter250perfectdodge] perfect_dodge_chime audio played")

	# ── 7. _resolve_melee_strike consumes buffer ──────────────────────
	if hero_src.find("if _perfect_dodge_buffer > 0.0:") < 0:
		printerr("FAIL: _resolve_melee_strike doesn't check _perfect_dodge_buffer")
		ok = false
	elif hero_src.find("PERFECT_DODGE_DAMAGE_MUL") < 0:
		printerr("FAIL: _resolve_melee_strike doesn't apply PERFECT_DODGE_DAMAGE_MUL")
		ok = false
	else:
		print("[iter250perfectdodge] buffer consumption +50% dmg + forced crit in _resolve_melee_strike")
	# Buffer zero on consume.
	if hero_src.find("_perfect_dodge_buffer = 0.0  # consume immediately") < 0:
		printerr("FAIL: _resolve_melee_strike doesn't consume buffer")
		ok = false
	else:
		print("[iter250perfectdodge] buffer consumed on first connect")

	# ── 8. Mid-dodge attack penalty ───────────────────────────────────
	# Find _start_attack chain in _physics_process. Verify that when
	# _dash_strike_time > 0, _iframes are zeroed.
	if hero_src.find("if _dash_strike_time > 0.0:\n\t\t\t# Mid-dodge attack penalty") < 0 and \
	   hero_src.find("# Mid-dodge attack penalty: kill i-frames") < 0:
		printerr("FAIL: input handler missing mid-dodge attack penalty branch")
		ok = false
	elif hero_src.find("_iframes = 0.0") < 0:
		printerr("FAIL: mid-dodge attack doesn't zero _iframes (penalty missing)")
		ok = false
	else:
		print("[iter250perfectdodge] mid-dodge attack penalty kills i-frames")

	# ── 9. _start_dash_strike resets _dodge_active_time ──────────────
	# Look for `_dodge_active_time = 0.0` in the _start_dash_strike body.
	var ds_idx: int = hero_src.find("func _start_dash_strike()")
	if ds_idx < 0:
		printerr("FAIL: _start_dash_strike function missing")
		ok = false
	else:
		var ds_body: String = hero_src.substr(ds_idx, 1500)
		if ds_body.find("_dodge_active_time = 0.0") < 0:
			printerr("FAIL: _start_dash_strike doesn't reset _dodge_active_time")
			ok = false
		else:
			print("[iter250perfectdodge] _dodge_active_time reset at dash start")

	if ok:
		print("[iter250perfectdodge] PASS")
		quit(0)
	else:
		print("[iter250perfectdodge] FAIL")
		quit(1)
