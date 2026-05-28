extends SceneTree

# Iter 137 — Damage-number readability + magnitude scaling.
#
# User directive: push the game toward Isaac/Hades feel. Damage numbers
# are the single most-frequent per-hit visual feedback; they should be
# loud, instantly readable, and scale with hit size so the player FEELS
# heavy hits without doing math.
#
# Pre-iter-137 baseline:
#   • Normal damage: 22 pt fixed size — mousy against busy combat
#   • Crit:          33 pt (only 50% bigger than normal — not enough
#                            visual gap to feel like a crit)
#   • Hero damage:   26 pt (player damage should hit harder visually
#                            than enemy damage)
#
# Iter-137 calibrates against the genre baseline (Hades/Isaac use
# 28-32 pt for normal damage, 36-42 pt for crits):
#
#   damage_number.tscn
#     • base font_size 22 → 28
#     • bounds widened (-56..56 / -40..-4) → (-72..72 / -56..-4)
#       so the larger crit + larger normal don't clip the "!" suffix
#
#   damage_number.gd
#     • crit variant   33 pt → 36 pt (widens gap from new 28 pt baseline)
#     • hero_damage    26 pt → 32 pt + shake amp/time 4/0.08 → 5/0.10
#                              (player damage hits harder visually)
#     • NEW magnitude-based scaling for "normal" variant:
#       digit text → font_size = 28 + clamp(damage - 1, 0, 8)
#       So: 1 dmg = 28 pt baseline
#           3 dmg = 30 pt
#           6 dmg = 32 pt
#          10+ dmg = 36 pt (capped to leave headroom for crit @ 36)
#       Heavier hits also rise +1.5 px per damage point so vertical
#       motion reinforces the size cue.
func _initialize() -> void:
	var ok := true

	var tscn := FileAccess.get_file_as_string("res://scenes/damage_number.tscn")
	var gd   := FileAccess.get_file_as_string("res://scripts/damage_number.gd")

	# ═══ Base font size bumped + bounds widened ═══
	if "theme_override_font_sizes/font_size = 28" not in tscn:
		push_error("FAIL: damage_number.tscn base font should be 28 pt (was 22)")
		ok = false
	if "theme_override_font_sizes/font_size = 22" in tscn:
		push_error("FAIL: leftover 22 pt font_size in tscn")
		ok = false
	if "offset_left = -72.0" not in tscn:
		push_error("FAIL: damage_number.tscn bounds should widen to -72..72 horizontal")
		ok = false
	if "offset_top = -56.0" not in tscn:
		push_error("FAIL: damage_number.tscn top bound should widen to -56")
		ok = false
	if ok:
		print("OK base font 28 pt + bounds (-72..72 / -56..-4)")

	# ═══ Crit variant bumped 33 → 36 ═══
	if "theme_override_font_sizes/font_size\", 36" not in gd and "font_size\", 36)" not in gd:
		push_error("FAIL: crit font_size should be 36 (was 33)")
		ok = false
	# Pre-iter-137 33 pt crit gone
	if "font_size\", 33)" in gd:
		push_error("FAIL: leftover crit 33 pt in damage_number.gd")
		ok = false
	if ok:
		print("OK crit variant bumped 33 → 36 pt (clearer gap from 28 pt baseline)")

	# ═══ hero_damage variant bumped ═══
	if "font_size\", 32)" not in gd:
		push_error("FAIL: hero_damage font_size should be 32 (was 26)")
		ok = false
	# Shake amp bumped
	if "n._shake_amp = 5.0" not in gd:
		push_error("FAIL: hero_damage _shake_amp should be 5.0 (was 4.0)")
		ok = false
	if "n._shake_time = 0.10" not in gd:
		push_error("FAIL: hero_damage _shake_time should be 0.10 (was 0.08)")
		ok = false
	if ok:
		print("OK hero_damage variant bumped: 32 pt + shake 5.0/0.10s")

	# ═══ Magnitude-based scaling for normal variant ═══
	# Implementation: if text.is_valid_int(), apply font_size = 28 + bonus
	# where bonus = clamp(dmg - 1, 0, 8). Plus rise scales too.
	if "text.is_valid_int()" not in gd:
		push_error("FAIL: magnitude-based scaling missing — should detect digit text via is_valid_int")
		ok = false
	if "28 + bonus" not in gd:
		push_error("FAIL: normal variant should scale font_size = 28 + bonus")
		ok = false
	if "clampi(dmg - 1, 0, 8)" not in gd:
		push_error("FAIL: damage bonus should clamp(dmg-1, 0, 8) so 10+ dmg caps at +8 pt")
		ok = false
	if "n._rise = RISE + float(bonus) * 1.5" not in gd:
		push_error("FAIL: heavier hits should also rise further (RISE + bonus * 1.5)")
		ok = false
	if ok:
		print("OK magnitude scaling: font_size = 28..36 by damage, rise scales too")

	# ═══ Runtime — scene still loads + DamageNumber.spawn() works ═══
	var scene: PackedScene = load("res://scenes/damage_number.tscn")
	if scene == null:
		push_error("FAIL: damage_number.tscn no longer loads")
		ok = false
	else:
		# Direct-instance test: spawn a 5-damage "normal" number, check
		# font_size override is 32 (28 + clamp(4, 0, 8) = 32).
		var DN = preload("res://scripts/damage_number.gd")
		var n = DN.spawn(Vector2(100, 100), "5", Color.WHITE)
		root.add_child(n)
		await process_frame
		var fs: int = n.get_theme_font_size("font_size")
		if fs != 32:
			push_error("FAIL: spawn('5') should produce font_size 32 (28 + 4); got %d" % fs)
			ok = false
		else:
			print("OK runtime spawn('5') → font_size 32 (28 + 4 bonus)")
		# Cap test: 100 damage should max out at 36 (28 + 8)
		var n2 = DN.spawn(Vector2(120, 100), "100", Color.WHITE)
		root.add_child(n2)
		await process_frame
		var fs2: int = n2.get_theme_font_size("font_size")
		if fs2 != 36:
			push_error("FAIL: spawn('100') should cap at font_size 36 (28 + 8); got %d" % fs2)
			ok = false
		else:
			print("OK runtime spawn('100') → font_size 36 (capped at +8)")
		n.queue_free()
		n2.queue_free()

	if ok:
		print("=== ITER 137 INTEGRATION PASSED ===")
	else:
		print("=== ITER 137 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
