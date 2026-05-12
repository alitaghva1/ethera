extends SceneTree

# Iter 80 — Workstream B of the post-iter-78 plan: hero dash afterimages
# retune to match the JS reference feel.
#
# JS captures every ~0.018s (denser) with golden tint (#ffd27a); we were
# at 0.04s with cyan-purple. Cyan reads cold + redundant with the existing
# slash/blast palette. Gold gives dash a unique color identity that
# matches the dash_trail particles' warm leaning.
#
# (The afterimage system itself was already implemented in iter 29 —
# this iter is a TUNING pass, not new infrastructure.)
func _initialize() -> void:
	var ok := true

	var hero_src := FileAccess.get_file_as_string("res://scripts/hero.gd")

	# Denser capture cadence — 0.04 → 0.025
	if not hero_src.contains("AFTERIMAGE_INTERVAL: float = 0.025"):
		push_error("FAIL: AFTERIMAGE_INTERVAL should be 0.025 (was 0.04)")
		ok = false
	else:
		print("OK AFTERIMAGE_INTERVAL = 0.025 (denser ghost trail)")

	# Warm gold tint — not cyan-purple
	if hero_src.contains("AFTERIMAGE_TINT: Color = Color(0.55, 0.85, 1.0"):
		push_error("FAIL: AFTERIMAGE_TINT still cyan-purple — should be warm gold")
		ok = false
	elif not hero_src.contains("AFTERIMAGE_TINT: Color = Color(1.0, 0.82, 0.48"):
		push_error("FAIL: AFTERIMAGE_TINT not at the new gold value (1.0, 0.82, 0.48)")
		ok = false
	else:
		print("OK AFTERIMAGE_TINT shifted to warm gold")

	# Longer fade — 0.22 → 0.30 (matches JS AFTERIMAGE_LIFE)
	if not hero_src.contains("AFTERIMAGE_FADE_TIME: float = 0.30"):
		push_error("FAIL: AFTERIMAGE_FADE_TIME should be 0.30")
		ok = false
	else:
		print("OK AFTERIMAGE_FADE_TIME = 0.30")

	# _spawn_dash_afterimage exists (iter-29 infrastructure preserved)
	if not hero_src.contains("func _spawn_dash_afterimage"):
		push_error("FAIL: _spawn_dash_afterimage function missing")
		ok = false
	else:
		print("OK _spawn_dash_afterimage function preserved")

	# Called from the dash-strike tick loop (still wired)
	if not (hero_src.contains("_afterimage_timer") and hero_src.contains("_spawn_dash_afterimage()")):
		push_error("FAIL: dash-tick loop no longer calls _spawn_dash_afterimage")
		ok = false
	else:
		print("OK dash-tick loop spawns afterimages during _dash_strike_time > 0")

	if ok:
		print("=== ITER 80 INTEGRATION PASSED ===")
	else:
		print("=== ITER 80 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
