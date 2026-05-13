extends SceneTree

# Iter 150 — Hero iframe visual polish.
#
# Pre-iter-150 the iframes visual was a hard binary flicker:
#   if _iframes > 0.0 and int(_iframes * 20) % 2 == 0:
#       sprite.modulate.a = 0.45
# That toggled alpha between 1.0 and 0.45 at 10 Hz. Functional —
# communicates "you're flashing" — but visually reads as "the hero
# is broken / glitching," not "the hero is spectral / invulnerable
# shielding."
#
# Genre cue: Hades uses a steady semi-transparent + slight cyan tint
# on Zagreus during dash i-frames. The smooth + tinted approach reads
# as "magical invulnerability" rather than retro-platformer flicker.
# Isaac's flicker is faster and uses no tint — closer to the old
# behavior — but Hades is the more polished benchmark and matches
# the rest of our visual grammar (smooth SINE pulses for danger and
# pickup beats).
#
# Iter-150:
#   • Replaces the binary flicker with a smooth 6 Hz SIN pulse on
#     alpha (0.50..0.95) — softer "breathing" rather than blink.
#   • Adds a slight cyan modulate (R=0.78, G=1.0, B=1.18) so the
#     hero reads as "spectral / shielded by invuln" not "ghost."
#   • Uses Time.get_ticks_msec() for the pulse phase so the breathe
#     stays consistent regardless of remaining iframes — phase
#     doesn't snap when a new iframe window starts.
#   • Branches changed from sequential to elif so we don't redundantly
#     set modulate to white before overwriting in the iframe branch.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/hero.gd")

	# ═══ Old binary flicker is gone ═══
	if "int(_iframes * 20) % 2 == 0" in gd:
		push_error("FAIL: old binary flicker (int(_iframes * 20) % 2) should be replaced")
		ok = false
	if "sprite.modulate.a = 0.45" in gd:
		push_error("FAIL: old hardcoded alpha 0.45 flicker line should be gone")
		ok = false

	# ═══ New SIN-pulse machinery ═══
	if "elif _iframes > 0.0:" not in gd:
		push_error("FAIL: iframe branch should be elif (cleaner than if-then-overwrite)")
		ok = false
	if "Time.get_ticks_msec() / 1000.0" not in gd:
		push_error("FAIL: pulse phase should use Time.get_ticks_msec() for global-stable cadence")
		ok = false
	if "sin(t_iframe * TAU * 6.0)" not in gd:
		push_error("FAIL: pulse should be 6 Hz sine (organic breathe)")
		ok = false
	if "lerpf(0.50, 0.95, pulse_iframe)" not in gd:
		push_error("FAIL: alpha should lerp between 0.50 and 0.95 — visible but spectral")
		ok = false

	# ═══ Cyan tint baked into modulate ═══
	if "Color(0.78, 1.0, 1.18, alpha_iframe)" not in gd:
		push_error("FAIL: iframe modulate should use cyan-tinted color (0.78, 1.0, 1.18)")
		ok = false

	# ═══ Shield path still wins (regression guard) ═══
	if "if _shield_time > 0.0:" not in gd:
		push_error("FAIL: shield branch still primary (regression)")
		ok = false
	if "sprite.modulate = SHIELD_TINT" not in gd:
		push_error("FAIL: shield path still sets SHIELD_TINT (regression)")
		ok = false

	if ok:
		print("OK iframe polish: smooth 6 Hz SIN alpha 0.50-0.95 + cyan tint (0.78, 1.0, 1.18)")
		print("=== ITER 150 INTEGRATION PASSED ===")
	else:
		print("=== ITER 150 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
