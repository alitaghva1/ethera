extends SceneTree

# Iter 139 — Enemy windup telegraph clarity (Hades-tier).
#
# Pre-iter-139 telegraphed_melee windup used:
#   • Red tint at peak (g/b channels faded × 0.6 — enemy goes ~40%
#     red-tinted)
#   • No scale cue
# At a glance during chaotic 4-enemy combat, a 40% red tint was easy
# to miss — playtester sees enemy still looking mostly normal until
# the swing already lands.
#
# Hades / Isaac signal telegraphed attacks with BOTH color AND motion:
# the enemy visually "tenses up" before striking. Two cues together
# read fine peripheral-vision-during-dash.
#
# Iter-139 strengthens the windup telegraph:
#   • g/b fade 0.6 → 0.75 (enemy now ~70% red-tinted at peak — clearly
#     reads as "red enemy")
#   • NEW monotonic scale pulse during windup: sprite_scale × (1.0 →
#     1.08) over the windup duration. Same grammar as the bomber prime
#     scale ramp (already in code at line ~683)
#   • Scale resets on SWING transition so cooldown state doesn't keep
#     the tensed silhouette
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/enemy.gd")

	# ═══ Stronger red tint (0.6 → 0.75) ═══
	if "wt * 0.75" not in gd:
		push_error("FAIL: windup g/b fade depth should be 0.75 (was 0.6)")
		ok = false
	# Old 0.6 multiplier in windup branch must be gone
	# (Note: there might be 0.6 elsewhere unrelated; check it's gone
	# from the windup color line)
	if "base.g * (1.0 - wt * 0.6)" in gd:
		push_error("FAIL: leftover 0.6 windup fade depth in enemy.gd")
		ok = false

	# ═══ Scale pulse during windup ═══
	if "0.08 * wt" not in gd:
		push_error("FAIL: windup should apply monotonic scale pulse via 0.08 * wt")
		ok = false
	if "t.sprite_scale * (1.0 + 0.08 * wt)" not in gd:
		push_error("FAIL: scale should be t.sprite_scale * (1.0 + 0.08 * wt) — preserves per-type base")
		ok = false

	# ═══ Scale reset on SWING transition ═══
	# Look for the explicit reset comment + sprite.scale assignment in
	# the SWING branch.
	if "iter-139 — restore base scale at swing-end" not in gd:
		push_error("FAIL: missing scale-reset comment in SWING branch")
		ok = false
	# Verify the reset line exists somewhere after the modulate reset
	# in SWING (we can't easily test positional order in a string check,
	# but presence of the reset is enough)
	var swing_resets: int = 0
	for line in gd.split("\n"):
		if "sprite.scale = Vector2(t.sprite_scale, t.sprite_scale)" in line:
			swing_resets += 1
	# Should appear twice: once in bomber prime abort path, once new in SWING
	if swing_resets < 2:
		push_error("FAIL: sprite.scale reset to base appears %d times, expected ≥2 (bomber + iter-139 SWING)" % swing_resets)
		ok = false

	if ok:
		print("OK windup telegraph: 75%% red fade + 8%% scale pulse + clean swing reset")
		print("=== ITER 139 INTEGRATION PASSED ===")
	else:
		print("=== ITER 139 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
