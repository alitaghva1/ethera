extends SceneTree

# Iter 145 — Enemy hit-reaction follow-through.
#
# Pre-iter-145 take_hit only flashed the modulate (white-bright tween
# 0.04s up, 0.10s back). The sprite stayed the same size during the
# flash — visually a 1-damage nick on a boss looked identical to a
# 50-damage crit on the same boss. Both produced the same white tint
# at the same size.
#
# Genre cue: Hades enemies all do a squash-and-stretch reaction frame
# on hit. Isaac enemies briefly puff. Both games make the hit FEEL
# like impact by having the enemy visually RECOIL, not just flash.
#
# For trash mobs without a hurt_sheet (iter-110 baked hurt frames for
# the ones that have them) this was the entire hit reaction. Iter-145
# adds a sprite-scale punch in parallel with the modulate flash:
#
#   • HIT_SCALE_PUNCH      = 1.15 (normal hit — subtle but visible)
#   • HIT_SCALE_PUNCH_CRIT = 1.32 (crit hit — pairs with iter-138
#                                  red splash ring, iter-140 deeper
#                                  hit-stop, iter-137 bigger damage
#                                  number)
#
# Tween structure:
#   t = create_tween().set_parallel(true)
#   [phase 1 — 0.04s parallel] modulate → flash_color + scale → base*punch
#   chain() + set_parallel(true)
#   [phase 2 — 0.10s parallel] modulate → (1,1,1,1) + scale → base
#
# base_scale derives from enemy_type.sprite_scale so a max-scale boss
# punches off its own baseline, not off 1.0. Settles to base after
# the punch — the iter-139 windup scale ramp can re-take from there.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/enemy.gd")

	# ═══ Constants ═══
	if "HIT_SCALE_PUNCH: float = 1.15" not in gd:
		push_error("FAIL: missing HIT_SCALE_PUNCH = 1.15")
		ok = false
	if "HIT_SCALE_PUNCH_CRIT: float = 1.32" not in gd:
		push_error("FAIL: missing HIT_SCALE_PUNCH_CRIT = 1.32 (deeper punch for crits)")
		ok = false

	# ═══ base_scale derives from enemy_type.sprite_scale ═══
	if "Vector2(enemy_type.sprite_scale, enemy_type.sprite_scale)" not in gd:
		push_error("FAIL: base_scale should derive from enemy_type.sprite_scale (preserve per-type baseline)")
		ok = false

	# ═══ punch_factor branches on is_crit ═══
	if "punch_factor: float = HIT_SCALE_PUNCH_CRIT if is_crit else HIT_SCALE_PUNCH" not in gd:
		push_error("FAIL: punch_factor should branch on is_crit (crit gets deeper punch)")
		ok = false

	# ═══ Tween is parallel — modulate AND scale both run in phase 1 ═══
	if "create_tween().set_parallel(true)" not in gd:
		push_error("FAIL: take_hit tween should be created with set_parallel(true) for stacked modulate+scale")
		ok = false
	# Phase-1 properties: modulate flash + scale up
	if "tween.tween_property(sprite, \"scale\", base_scale * punch_factor, 0.04)" not in gd:
		push_error("FAIL: phase-1 should tween scale to base_scale * punch_factor over 0.04s")
		ok = false
	# Chain marker between phases
	if "tween.chain().set_parallel(true)" not in gd:
		push_error("FAIL: tween should chain() between phase 1 (punch) and phase 2 (settle)")
		ok = false
	# Phase-2 scale settle
	if "tween.tween_property(sprite, \"scale\", base_scale, 0.10)" not in gd:
		push_error("FAIL: phase-2 should tween scale back to base_scale over 0.10s")
		ok = false

	# ═══ Modulate flash still runs (regression guard) ═══
	if "tween.tween_property(sprite, \"modulate\", flash_color, 0.04)" not in gd:
		push_error("FAIL: phase-1 modulate flash regression — should still tween to flash_color over 0.04s")
		ok = false
	if "tween.tween_property(sprite, \"modulate\", Color(1, 1, 1, 1), 0.10)" not in gd:
		push_error("FAIL: phase-2 modulate settle regression — should tween back to (1,1,1,1) over 0.10s")
		ok = false

	if ok:
		print("OK enemy hit-reaction: parallel modulate + scale punch (1.15 normal / 1.32 crit) per hit")
		print("=== ITER 145 INTEGRATION PASSED ===")
	else:
		print("=== ITER 145 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
