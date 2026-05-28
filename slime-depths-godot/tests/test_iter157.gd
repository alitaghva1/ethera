extends SceneTree

# Iter 157 — Boss HP bar damage pulse.
#
# Pre-iter-157 the boss HP bar smoothly decremented every frame the
# main.gd _process poll detected an hp change:
#   boss_hp_bar.value = float(_boss_ref.hp)
# Functional but feel-flat: a 1-damage chip looked identical to a
# 50-damage crit at the bar level. The hits behind the bar carried
# all the punch (iter-138 splash ring, iter-140 hit-stop, etc.) but
# the bar itself was numbly decrementing.
#
# Genre cue: every boss-fight game (DMC, Hades' boss bars, Bayonetta
# rank counter, even Pokémon's HP bars) pulse the bar on damage. The
# bar is THE focal point during a boss fight — it should react.
#
# Iter-157:
#   • Track `_prev_boss_hp` across the poll loop.
#   • When (_boss_ref.hp < _prev_boss_hp), pulse the bar Control:
#       scale 1.06 + warm-red modulate (1.5, 0.85, 0.85) snap
#       parallel tween both → rest over 0.22 s, QUAD ease-out.
#   • Arm `_prev_boss_hp = max_hp` at boss-spawn so the first hit
#     reads as a decrement (otherwise first frame would compare
#     against 0 → false-pulse).
#   • Reset `_prev_boss_hp = 0` on boss-death so the next boss
#     starts clean.
#   • Pulse only on DECREASE — boss heals (phase transitions might
#     do this) skip the pulse. Heals shouldn't read as "boss took
#     damage."
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Tracking vars ═══
	if "var _prev_boss_hp: int = 0" not in gd:
		push_error("FAIL: missing _prev_boss_hp tracking var")
		ok = false
	if "var _boss_hp_pulse_tween: Tween = null" not in gd:
		push_error("FAIL: missing _boss_hp_pulse_tween cache var")
		ok = false

	# ═══ Decrement-only detection in _process ═══
	if "if _prev_boss_hp > 0 and _boss_ref.hp < _prev_boss_hp:" not in gd:
		push_error("FAIL: pulse should only fire when boss hp DECREASED (and tracker armed)")
		ok = false
	if "_pulse_boss_bar()" not in gd:
		push_error("FAIL: detection should call _pulse_boss_bar()")
		ok = false
	if "_prev_boss_hp = _boss_ref.hp" not in gd:
		push_error("FAIL: tracker should be updated AFTER the pulse check")
		ok = false

	# ═══ Arm at boss spawn ═══
	if "_prev_boss_hp = type_res.max_hp" not in gd:
		push_error("FAIL: boss-spawn should arm _prev_boss_hp with max_hp")
		ok = false

	# ═══ Reset on boss death ═══
	if "_prev_boss_hp = 0" not in gd:
		push_error("FAIL: boss-death branch should reset _prev_boss_hp to 0")
		ok = false

	# ═══ Pulse helper exists with right shape ═══
	if "func _pulse_boss_bar() -> void:" not in gd:
		push_error("FAIL: missing _pulse_boss_bar() helper")
		ok = false
	if "boss_bar.scale = Vector2(1.06, 1.06)" not in gd:
		push_error("FAIL: pulse should snap scale to (1.06, 1.06)")
		ok = false
	if "Color(1.5, 0.85, 0.85, 1.0)" not in gd:
		push_error("FAIL: pulse should snap modulate to warm-red HDR (1.5, 0.85, 0.85)")
		ok = false
	# Parallel tween both back to rest
	if "_boss_hp_pulse_tween = create_tween().set_parallel(true)" not in gd:
		push_error("FAIL: pulse tween should be parallel for scale + modulate")
		ok = false
	if "tween_property(boss_bar, \"scale\", Vector2.ONE, 0.22)" not in gd:
		push_error("FAIL: pulse should ease scale back to ONE over 0.22 s")
		ok = false
	if "tween_property(boss_bar, \"modulate\", Color(1, 1, 1, 1), 0.22)" not in gd:
		push_error("FAIL: pulse should ease modulate back to white over 0.22 s")
		ok = false

	if ok:
		print("OK boss HP pulse: scale 1.06 + warm-red modulate on every decrement, 0.22 s ease-out")
		print("=== ITER 157 INTEGRATION PASSED ===")
	else:
		print("=== ITER 157 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
