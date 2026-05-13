extends SceneTree

# Iter 156 — New relic icon arrival animation.
#
# Pre-iter-156 picking up a relic triggered _rebuild_relic_strip()
# which cleared and re-instanced ALL icons in the HBoxContainer.
# Visually the new icon just APPEARED at the end of the strip — no
# entrance animation. The iter-72 PickupBanner provided the
# headline beat (centered banner + theme-colored border), but the
# HUD-strip arrival itself was invisible. Players who looked at the
# strip after the banner couldn't tell which icon was the new one.
#
# Genre cue: Hades, Isaac, Risk of Rain all animate the inventory
# icon on pickup. The "where did the new thing go" question should
# answer itself visually as the icon punches in.
#
# Iter-156 adds an arrival tween fired ONLY for the newly-added
# icon in _rebuild_relic_strip:
#
#   1. _rebuild_relic_strip signature gains optional `newly_added_id`
#      parameter (default "" for non-pickup rebuilds — _ready,
#      familiar sync, etc.). Existing callers stay binary-compatible.
#   2. _on_pickup_claimed passes the picked-up _name as the new ID.
#      Shrines (_name = "shrine_*") aren't in RELIC_REGISTRY so no
#      matching icon → no tween (correct: shrine pickups don't add
#      to the strip).
#   3. Inside the loop, when rid matches newly_added_id, call
#      _animate_new_relic_icon(icon).
#   4. _animate_new_relic_icon: snap scale=1.45 + HDR gold modulate
#      (1.6, 1.35, 0.85), then parallel tween BOTH back to rest
#      over 0.45 s with QUAD ease-out. Same architectural shape as
#      _pulse_label.
func _initialize() -> void:
	var ok := true

	var gd := FileAccess.get_file_as_string("res://scripts/main.gd")

	# ═══ Signature widened with default arg ═══
	if "func _rebuild_relic_strip(newly_added_id: String = \"\") -> void:" not in gd:
		push_error("FAIL: _rebuild_relic_strip should accept optional newly_added_id parameter")
		ok = false

	# ═══ Branch fires the animation when ID matches ═══
	if "if newly_added_id != \"\" and rid == newly_added_id:" not in gd:
		push_error("FAIL: rebuild should fire animation when newly_added_id matches rid")
		ok = false
	if "_animate_new_relic_icon(icon)" not in gd:
		push_error("FAIL: rebuild should call _animate_new_relic_icon for the matching icon")
		ok = false

	# ═══ Animator helper exists ═══
	if "func _animate_new_relic_icon(icon: Control) -> void:" not in gd:
		push_error("FAIL: missing _animate_new_relic_icon(icon) helper")
		ok = false

	# ═══ Initial snap to 1.45 scale + HDR gold ═══
	if "icon.scale = Vector2(1.45, 1.45)" not in gd:
		push_error("FAIL: animator should snap scale to (1.45, 1.45) on entry")
		ok = false
	if "icon.modulate = Color(1.6, 1.35, 0.85, 1.0)" not in gd:
		push_error("FAIL: animator should snap modulate to HDR gold (1.6, 1.35, 0.85)")
		ok = false

	# ═══ Parallel tween settles both back to rest ═══
	if "create_tween().set_parallel(true)" not in gd:
		push_error("FAIL: animator should use parallel tween for scale + modulate")
		ok = false
	if "tw.tween_property(icon, \"scale\", Vector2.ONE, 0.45)" not in gd:
		push_error("FAIL: scale should tween back to ONE over 0.45 s")
		ok = false
	if "tw.tween_property(icon, \"modulate\", Color(1, 1, 1, 1), 0.45)" not in gd:
		push_error("FAIL: modulate should tween back to white over 0.45 s")
		ok = false

	# ═══ _on_pickup_claimed forwards the name ═══
	if "_rebuild_relic_strip(_name)" not in gd:
		push_error("FAIL: _on_pickup_claimed should call _rebuild_relic_strip(_name) to pass the new ID")
		ok = false

	if ok:
		print("OK new-relic arrival: 1.45 scale + gold modulate punch, 0.45 s ease-out to rest")
		print("=== ITER 156 INTEGRATION PASSED ===")
	else:
		print("=== ITER 156 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
