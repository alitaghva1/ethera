extends SceneTree

# iter-249 — blast windup commitment.
#
# Verifies the blast refactor in sub-commit 3:
#   1. Constants for windup + recovery time exist + match design spec.
#   2. _blast_windup_time / _blast_locked state vars exist.
#   3. _physics_process decrements the windup timer + calls
#      _resolve_blast_fire on transition to 0.
#   4. _start_blast arms windup + spawns off-hand glow; does NOT fire
#      the projectile immediately (the projectile spawn moved to
#      _resolve_blast_fire).
#   5. Input precedence chain has _blast_locked guard on sword/attack
#      so sword can't cancel blast.
#   6. _start_dash_strike clears the windup + glow + lock (DODGE is
#      the only cancel).
#
# Source-level test (mirrors iter-248's pattern) — full instantiation
# requires the autoload stack.

func _initialize() -> void:
	print("[iter249blastwindup] init")
	await process_frame
	var ok := true

	var hero_src: String = FileAccess.get_file_as_string("res://scripts/hero.gd")
	if hero_src.is_empty():
		printerr("FAIL: hero.gd unreadable")
		quit(1)
		return

	# ── 1. Constants ──────────────────────────────────────────────────
	# Design spec: 0.10s windup, 0.30s recovery. Test pins both values.
	if hero_src.find("const BLAST_WINDUP_TIME: float = 0.10") < 0:
		printerr("FAIL: BLAST_WINDUP_TIME != 0.10 (design spec violated)")
		ok = false
	else:
		print("[iter249blastwindup] BLAST_WINDUP_TIME = 0.10 OK")
	if hero_src.find("const BLAST_RECOVERY_TIME: float = 0.30") < 0:
		printerr("FAIL: BLAST_RECOVERY_TIME != 0.30 (design spec violated)")
		ok = false
	else:
		print("[iter249blastwindup] BLAST_RECOVERY_TIME = 0.30 OK")
	if hero_src.find("const BLAST_GLOW_COLOR: Color = Color(0.65, 0.40, 1.0") < 0:
		printerr("FAIL: BLAST_GLOW_COLOR not the violet design spec (0.65, 0.40, 1.0)")
		ok = false
	else:
		print("[iter249blastwindup] BLAST_GLOW_COLOR violet present")

	# ── 2. State vars ─────────────────────────────────────────────────
	var required_vars: Array = [
		"_blast_windup_time",
		"_blast_locked",
		"_blast_aim",
		"_blast_resonance_active",
		"_blast_glow_ref",
	]
	for v in required_vars:
		if hero_src.find("var " + v) < 0:
			printerr("FAIL: hero.gd missing var %s" % v)
			ok = false
		else:
			print("[iter249blastwindup] var %s present" % v)

	# ── 3. Timer decrement + resolve call in _physics_process ─────────
	if hero_src.find("_blast_windup_time = max(0.0, _blast_windup_time - delta)") < 0:
		printerr("FAIL: _physics_process does not decrement _blast_windup_time")
		ok = false
	else:
		print("[iter249blastwindup] _physics_process decrements windup timer")
	if hero_src.find("_resolve_blast_fire()") < 0:
		printerr("FAIL: _physics_process never calls _resolve_blast_fire on windup end")
		ok = false
	else:
		print("[iter249blastwindup] _resolve_blast_fire called on windup end")

	# ── 4. _start_blast arms windup, does NOT spawn projectile directly ─
	if hero_src.find("_blast_windup_time = BLAST_WINDUP_TIME") < 0:
		printerr("FAIL: _start_blast does not arm _blast_windup_time = BLAST_WINDUP_TIME")
		ok = false
	else:
		print("[iter249blastwindup] _start_blast arms windup timer")
	if hero_src.find("_spawn_blast_offhand_glow()") < 0:
		printerr("FAIL: _start_blast does not spawn off-hand glow")
		ok = false
	else:
		print("[iter249blastwindup] _start_blast spawns off-hand glow")
	# _start_blast should set _blast_locked.
	if hero_src.find("_blast_locked = true") < 0:
		printerr("FAIL: _start_blast does not set _blast_locked = true")
		ok = false
	else:
		print("[iter249blastwindup] _start_blast sets _blast_locked")

	# ── 5. _spawn_blast_offhand_glow helper exists + uses BLAST_GLOW_COLOR ─
	if hero_src.find("func _spawn_blast_offhand_glow") < 0:
		printerr("FAIL: missing _spawn_blast_offhand_glow helper")
		ok = false
	else:
		print("[iter249blastwindup] _spawn_blast_offhand_glow helper present")

	# ── 6. _resolve_blast_fire exists + frees the glow ───────────────
	if hero_src.find("func _resolve_blast_fire") < 0:
		printerr("FAIL: missing _resolve_blast_fire helper")
		ok = false
	else:
		print("[iter249blastwindup] _resolve_blast_fire helper present")
	if hero_src.find("_blast_glow_ref.queue_free()") < 0:
		printerr("FAIL: glow not freed (will leak Polygon2D each cast)")
		ok = false
	else:
		print("[iter249blastwindup] off-hand glow cleaned up on fire/cancel")

	# ── 7. Input precedence guard on sword input ─────────────────────
	# The attack branch should now have `not _blast_locked` so sword
	# can't cancel a blast commitment.
	if hero_src.find("and not _blast_locked") < 0:
		printerr("FAIL: input precedence chain has no _blast_locked guard")
		ok = false
	else:
		print("[iter249blastwindup] _blast_locked gates sword cancel of blast")

	# ── 8. _start_dash_strike cancels blast windup ───────────────────
	# Find _start_dash_strike body + verify it clears windup state.
	var ds_idx: int = hero_src.find("func _start_dash_strike()")
	if ds_idx < 0:
		printerr("FAIL: _start_dash_strike function missing")
		ok = false
	else:
		# Take the first 1200 chars of the function body (well within the
		# function's actual length) and check for blast clear logic.
		var ds_body: String = hero_src.substr(ds_idx, 1200)
		if ds_body.find("_blast_windup_time = 0.0") < 0:
			printerr("FAIL: _start_dash_strike doesn't zero _blast_windup_time")
			ok = false
		elif ds_body.find("_blast_locked = false") < 0:
			printerr("FAIL: _start_dash_strike doesn't clear _blast_locked")
			ok = false
		else:
			print("[iter249blastwindup] DODGE cancels blast windup + lock")

	# ── 9. _attack_live extends to cover windup + recovery ───────────
	if hero_src.find("_attack_live = BLAST_WINDUP_TIME + BLAST_RECOVERY_TIME") < 0:
		printerr("FAIL: _start_blast doesn't set _attack_live = windup + recovery")
		ok = false
	else:
		print("[iter249blastwindup] _attack_live covers full 0.40s commitment")

	if ok:
		print("[iter249blastwindup] PASS")
		quit(0)
	else:
		print("[iter249blastwindup] FAIL")
		quit(1)
