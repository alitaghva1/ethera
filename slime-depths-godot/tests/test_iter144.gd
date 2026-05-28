extends SceneTree

# Iter 144 — Mid-wave clear payoff.
#
# Pre-iter-144 a mid-wave clear (when more waves remain in this room)
# just updated `wave_label.text` to "WAVE N CLEAR · next in 0.9s". No
# visual celebration, no audio sting, no camera punch — surviving a
# wave looked identical to changing a status line.
#
# Genre peers (Hades' "well-fought" stinger, Isaac's wave-clear pop)
# layer a small celebration beat on every wave clear so the player
# FEELS the accomplishment, however brief. The final wave already
# fires FloorClearBurst (a loud full-screen celebration); the gap was
# the in-room MID-wave clears.
#
# Iter-144 layers three lightweight cues — all comfortably under the
# 0.9s WAVE_CLEAR_PAUSE window so they finish before the next wave
# spawns:
#
#   1. wave_label pulse — reuse _pulse_label with KILLS_FLASH_MODULATE
#      (cream-gold) and 1.20 scale peak over 0.45s. The wave_label
#      itself becomes the celebration anchor.
#
#   2. FX.shake(1.8, 0.08) — brief camera punch. Quieter than a kill
#      shake (6.0/0.12) so it doesn't read as "you took damage"; just
#      enough motion to mark the moment.
#
#   3. Gold spark at hero position via FX.HIT_SPARK_SCENE. Same gold
#      semantic as iter-143's pickup spark fallback. Spawned directly
#      to root so it doesn't move with the camera offset.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Tween cache var added ═══
	if "var _wave_label_pulse_tween: Tween = null" not in gd:
		push_error("FAIL: missing _wave_label_pulse_tween cache var")
		ok = false

	# ═══ Pulse on the wave_label uses KILLS_FLASH_MODULATE + 0.45s ═══
	if "_pulse_label(wave_label, \"_wave_label_pulse_tween\", 1.20, KILLS_FLASH_MODULATE, 0.45)" not in gd:
		push_error("FAIL: wave_label should pulse 1.20 scale @ KILLS_FLASH_MODULATE for 0.45s")
		ok = false

	# ═══ Brief camera shake ═══
	if "FX.shake(1.8, 0.08)" not in gd:
		push_error("FAIL: wave-clear should call FX.shake(1.8, 0.08) — quieter than kill (6.0/0.12)")
		ok = false

	# ═══ Gold spark at hero position ═══
	if "FX.HIT_SPARK_SCENE.instantiate()" not in gd:
		push_error("FAIL: wave-clear should spawn a HIT_SPARK at hero pos")
		ok = false
	if "hero.global_position + Vector2(0, -10)" not in gd:
		push_error("FAIL: spark should spawn slightly above hero head (Vector2(0, -10))")
		ok = false

	# ═══ Celebration only fires on MID-wave clear (the if branch), not the final ROOM CLEAR ═══
	# The final-room branch already runs FloorClearBurst — we don't want to double-up.
	# Quick sanity: the new pulse call should appear in the if-branch above the else (final-clear branch).
	var on_cleared_idx: int = gd.find("func _on_wave_cleared() -> void:")
	if on_cleared_idx < 0:
		push_error("FAIL: _on_wave_cleared function missing")
		ok = false
	else:
		var next_func_idx: int = gd.find("\nfunc ", on_cleared_idx + 1)
		if next_func_idx < 0:
			next_func_idx = gd.length()
		var body: String = gd.substr(on_cleared_idx, next_func_idx - on_cleared_idx)
		# Find the position of the FloorClearBurst call (final clear branch)
		var floor_burst_idx: int = body.find("FloorClearBurst.spawn(self, is_big)")
		var pulse_idx: int = body.find("_pulse_label(wave_label,")
		if floor_burst_idx < 0:
			push_error("FAIL: FloorClearBurst.spawn call missing from _on_wave_cleared")
			ok = false
		elif pulse_idx < 0:
			push_error("FAIL: wave_label pulse missing from _on_wave_cleared")
			ok = false
		elif pulse_idx > floor_burst_idx:
			push_error("FAIL: wave_label pulse should be in the MID-wave branch (above the final-clear FloorClearBurst)")
			ok = false

	if ok:
		print("OK wave-clear payoff: wave_label gold pulse + 1.8/0.08 shake + hero spark")
		print("=== ITER 144 INTEGRATION PASSED ===")
	else:
		print("=== ITER 144 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
