extends SceneTree

# Iter 151 — Combo break feedback.
#
# Pre-iter-151 losing a combo was visually silent:
#   _reset_combo() → combo_changed.emit(0) → _on_hero_combo_changed(0) →
#   `if new_value < 5: visible = false`
# A player on a 50-combo streak who took one hit went from a bright
# orange-yellow "x50 COMBO" label to NO label, with no acknowledgment
# of the loss. Players didn't notice the streak ended until they
# checked the corner.
#
# Genre cue: streak-based games (DMC, Bayonetta, Hades' deep-strike
# meter, Cuphead's rank system) all surface combo loss explicitly.
# The break is its own emotional beat — celebrating the streak
# without mourning its end leaves the player numb to the cost of
# taking damage.
#
# Iter-151 adds a "STREAK LOST" red-flash beat when combo drops from
# ≥ 10 to 0:
#
#   Phase 1 (snap): scale 1.30 + HDR red modulate (1.5, 0.35, 0.30)
#                   text → "STREAK LOST"
#   Phase 2 (0.30s parallel): scale → 1.0 + modulate → dim red
#   Phase 3 (chain 0.30s): alpha → 0, then hide + reset
#
# Total ~0.6 s. Short enough to read at a glance, long enough to
# register the loss. Only fires for ≥ 10 — sub-tier combos (5..9)
# fail silently as before, no clutter for tiny streaks.
#
# Tracked via main.gd's _prev_combo var — incremented in
# _on_hero_combo_changed BEFORE the next call so the
# (prev ≥ 10, new == 0) transition is detectable.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Tracking var ═══
	if "var _prev_combo: int = 0" not in gd:
		push_error("FAIL: missing _prev_combo tracking var")
		ok = false
	if "var _combo_break_tween: Tween = null" not in gd:
		push_error("FAIL: missing _combo_break_tween cache var")
		ok = false

	# ═══ Detection branch — combo dropped from meaningful tier to 0 ═══
	if "if new_value == 0 and _prev_combo >= 10 and _combo_label != null:" not in gd:
		push_error("FAIL: combo-break detection should fire on (new==0 and prev≥10)")
		ok = false

	# ═══ _show_combo_break method ═══
	if "func _show_combo_break() -> void:" not in gd:
		push_error("FAIL: missing _show_combo_break() helper")
		ok = false

	# ═══ Visual: "STREAK LOST" text ═══
	if "_combo_label.text = \"STREAK LOST\"" not in gd:
		push_error("FAIL: combo-break should set text = STREAK LOST")
		ok = false

	# ═══ Snap to HDR red + scale 1.30 ═══
	if "_combo_label.scale = Vector2(1.30, 1.30)" not in gd:
		push_error("FAIL: combo-break should snap to scale (1.30, 1.30) on entry")
		ok = false
	if "Color(1.5, 0.35, 0.30, 1.0)" not in gd:
		push_error("FAIL: combo-break should snap to HDR-red modulate (1.5, 0.35, 0.30)")
		ok = false

	# ═══ Phase-2 settle: scale + modulate to dim red ═══
	if "Color(0.85, 0.32, 0.30, 1.0)" not in gd:
		push_error("FAIL: combo-break phase 2 should settle to dim red (0.85, 0.32, 0.30)")
		ok = false

	# ═══ Phase-3 chain alpha fade + hide callback ═══
	if "_combo_break_tween.chain().tween_property(_combo_label, \"modulate:a\", 0.0, 0.30)" not in gd:
		push_error("FAIL: combo-break phase 3 should chain an alpha fade to 0")
		ok = false
	if "_combo_label.visible = false" not in gd:
		push_error("FAIL: combo-break should hide the label after the fade")
		ok = false

	# ═══ _prev_combo updated at the bottom of all paths ═══
	if "_prev_combo = new_value" not in gd:
		push_error("FAIL: _prev_combo should be updated at the end of _on_hero_combo_changed")
		ok = false

	if ok:
		print("OK combo break: STREAK LOST red flash + scale punch, then fade out")
		print("=== ITER 151 INTEGRATION PASSED ===")
	else:
		print("=== ITER 151 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
