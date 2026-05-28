extends SceneTree

# Iter 138 — Crit splash ring visual upgrade.
#
# Hit-spark variety: instead of inventing a multi-variant spark scene,
# focus on making CRITS read distinctly louder than normal hits. Normal
# hits keep the existing warm-gold spark (good baseline); crits get a
# bigger, redder, more particulate splash so the player FEELS the
# critical land.
#
# Pre-iter-138 crit splash (iter-43 baseline):
#   • 5 sparks in a ring
#   • Radius 12-18 px
#   • Color (1.0, 0.25, 0.30) — salmon-pink, fairly desaturated
#   • Default scale (= 1.0)
#
# Iter-138 — Hades-style "crits feel chunky":
#   • 9 sparks in a ring (+80%)
#   • Radius 18-32 px (~80% wider — splash extends past sword arc)
#   • Color (1.10, 0.22, 0.16) — saturated red-orange with a slight
#     >1 red channel for HDR-pop on bright torch-lit floors
#   • Per-spark scale × 1.4 (40% bigger sparks)
#
# Normal sparks (fx.gd's auto-spawn on enemy_hit) are UNCHANGED — gold
# remains the baseline. The crit splash is the lone variant; that's
# enough visual differentiation for combat-time readability.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/attack_feel.gd")

	# ═══ 9 sparks (was 5) ═══
	if "for i in range(9):" not in gd:
		push_error("FAIL: crit ring should spawn 9 sparks (was 5)")
		ok = false
	# Old 5-spark loop must be gone
	if "for i in range(5):" in gd:
		push_error("FAIL: leftover 5-spark crit loop")
		ok = false

	# ═══ Ring radius widened ═══
	if "18.0 + randf() * 14.0" not in gd:
		push_error("FAIL: crit ring radius should be 18-32 px (was 12-18)")
		ok = false
	if "12.0 + randf() * 6.0" in gd:
		push_error("FAIL: leftover 12-18 px crit radius range")
		ok = false

	# ═══ Saturated red tint ═══
	if "Color(1.10, 0.22, 0.16, 1.0)" not in gd:
		push_error("FAIL: crit spark color should be saturated red-orange (1.10, 0.22, 0.16)")
		ok = false

	# ═══ Per-spark scale × 1.4 ═══
	if "s2.scale = Vector2(1.4, 1.4)" not in gd:
		push_error("FAIL: crit sparks should scale × 1.4")
		ok = false

	# ═══ Modulate-in-condition path removed (now unconditional) ═══
	# Pre-iter-138 used `if "modulate" in s2:` defensive check — that's
	# noise now that we always set both modulate + scale.
	if "if \"modulate\" in s2:" in gd:
		push_error("FAIL: defensive modulate-in check should be gone (always set in iter-138)")
		ok = false

	if ok:
		print("OK crit splash: 9 sparks × 18-32 px ring × red-orange × scale 1.4")
		print("=== ITER 138 INTEGRATION PASSED ===")
	else:
		print("=== ITER 138 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
