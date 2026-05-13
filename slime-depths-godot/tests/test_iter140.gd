extends SceneTree

# Iter 140 — Crit swing hit-stop deepening.
#
# Pre-iter-140 every connecting swing used the same hit-stop:
#   SWING_HIT_STOP_SCALE = 0.18  (82% slowdown)
#   SWING_HIT_STOP_TIME  = 0.035 (~2 frames at 60fps)
# That's correct for a normal poke — short enough to keep mash-attack
# responsive. But crits felt identical to normal hits at the
# control-loop level: the damage number was bigger, the splash ring
# (iter-138) was redder, but the FREEZE was the same. A crit landing
# didn't make the player BLINK.
#
# Hades / Isaac both punch hit-stop deeper on crits / heavy hits — the
# moment of "wait, did I just—" makes crits feel celebratory instead
# of being a hidden +damage. Iter-140 threads `any_crit` through the
# swing_connected signal so main.gd can pick a deeper / longer freeze:
#   CRIT_SWING_HIT_STOP_SCALE = 0.05  (95% slowdown, matches damage-stop)
#   CRIT_SWING_HIT_STOP_TIME  = 0.10  (~6 frames at 60fps)
# Multi-hit bonus still stacks on either path so a 3-hit crit cleave
# still scales up.
func _initialize() -> void:
	var ok := true

	var hero_gd := FileAccess.get_file_as_string("res://scripts/hero.gd")
	var main_gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Signal signature gained `any_crit: bool` ═══
	if "signal swing_connected(hit_count: int, any_crit: bool)" not in hero_gd:
		push_error("FAIL: swing_connected signal should expose any_crit: bool")
		ok = false
	# Old single-arg signature must be gone
	if "signal swing_connected(hit_count: int)\n" in hero_gd:
		push_error("FAIL: leftover old single-arg swing_connected signal")
		ok = false

	# ═══ any_crit tracked across the swing loop ═══
	if "var any_crit: bool = false" not in hero_gd:
		push_error("FAIL: hero swing loop should initialize any_crit: bool = false")
		ok = false
	if "any_crit = true" not in hero_gd:
		push_error("FAIL: hero should set any_crit = true on per-enemy crit roll")
		ok = false

	# ═══ Emit passes any_crit ═══
	if "swing_connected.emit(hit_count, any_crit)" not in hero_gd:
		push_error("FAIL: swing_connected.emit should pass (hit_count, any_crit)")
		ok = false
	# Old single-arg emit must be gone
	if "swing_connected.emit(hit_count)\n" in hero_gd:
		push_error("FAIL: leftover old single-arg swing_connected emit")
		ok = false

	# ═══ main.gd has the new crit hit-stop constants ═══
	if "CRIT_SWING_HIT_STOP_SCALE := 0.05" not in main_gd:
		push_error("FAIL: main.gd missing CRIT_SWING_HIT_STOP_SCALE = 0.05")
		ok = false
	if "CRIT_SWING_HIT_STOP_TIME  := 0.10" not in main_gd \
			and "CRIT_SWING_HIT_STOP_TIME := 0.10" not in main_gd:
		push_error("FAIL: main.gd missing CRIT_SWING_HIT_STOP_TIME = 0.10")
		ok = false

	# ═══ Handler signature widened with any_crit param ═══
	if "func _on_hero_swing_connected(hit_count: int, any_crit: bool = false)" not in main_gd:
		push_error("FAIL: _on_hero_swing_connected should accept any_crit: bool = false")
		ok = false

	# ═══ Handler branches on any_crit ═══
	if "if any_crit:" not in main_gd:
		push_error("FAIL: _on_hero_swing_connected should branch on any_crit")
		ok = false
	# Both constant uses present
	if "Engine.time_scale = CRIT_SWING_HIT_STOP_SCALE" not in main_gd:
		push_error("FAIL: crit branch should set Engine.time_scale = CRIT_SWING_HIT_STOP_SCALE")
		ok = false
	if "_hit_stop_timer = CRIT_SWING_HIT_STOP_TIME + multi_bonus" not in main_gd:
		push_error("FAIL: crit branch should set _hit_stop_timer = CRIT_SWING_HIT_STOP_TIME + multi_bonus")
		ok = false

	if ok:
		print("OK swing hit-stop: normal 0.18/0.035s, crit 0.05/0.10s (any_crit threaded)")
		print("=== ITER 140 INTEGRATION PASSED ===")
	else:
		print("=== ITER 140 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
