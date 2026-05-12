extends SceneTree

# Iter 90 — slash "floaty / not connected to character frame" fix.
#
# After iter 89 (forward offset), user reported the slash still felt
# disconnected from the hero. Diagnosis:
#   1. Slash was parented to current_scene → hung in world space while
#      the hero lunged 11+ px forward during the 0.18s swing.
#   2. Slash visual was 100-166 px wide vs. hero's 60 px draw size +
#      56 px attack range — read as a giant overlay, not a swing.
#   3. Slash animation ran 0.30s vs. swing window 0.18s — slash lingered
#      past the actual strike.
#
# Three fixes:
#   1. screen_flash.gd parents the slash to the hero (not current_scene)
#   2. scale_mul divisor /18.0 → /28.0 with clamp (0.4, 0.7) — fits hero
#   3. slash_arc_meta.json fps 30 → 50 — duration matches swing window
func _initialize() -> void:
	var ok := true

	# ═══ 1. Slash parented to hero ═══
	var sf_src := FileAccess.get_file_as_string("res://scripts/screen_flash.gd")
	# The parent assignment must prefer hero over current_scene.
	if not sf_src.contains("hero if hero != null else get_tree().current_scene"):
		push_error("FAIL: screen_flash.gd doesn't parent slash to hero (still using current_scene)")
		ok = false
	else:
		print("OK screen_flash.gd parents slash to hero (falls back to current_scene)")

	# ═══ 2. Tighter scale_mul ═══
	if sf_src.contains("/ 18.0"):
		push_error("FAIL: screen_flash.gd still has old /18.0 scale_mul divisor (slash too big)")
		ok = false
	elif not sf_src.contains("/ 28.0"):
		push_error("FAIL: screen_flash.gd missing /28.0 scale_mul divisor (iter-90 tuning)")
		ok = false
	else:
		print("OK screen_flash.gd scale_mul divisor is /28.0")

	# Clamp range must also be tightened — old (0.7, 1.3) would defeat
	# the /28 divisor (everything would clamp up to 0.7 or 1.3).
	if not sf_src.contains("0.4, 0.7"):
		push_error("FAIL: screen_flash.gd scale_mul clamp not (0.4, 0.7) — slash sizing won't track tuning")
		ok = false
	else:
		print("OK screen_flash.gd scale_mul clamp is (0.4, 0.7) — slash stays hero-proportioned")

	# ═══ 3. Slash animation fps bumped ═══
	var meta_path := "res://assets/fx/slash_arc_meta.json"
	if not FileAccess.file_exists(meta_path):
		push_error("FAIL: slash_arc_meta.json missing")
		ok = false
	else:
		var f := FileAccess.open(meta_path, FileAccess.READ)
		var meta = JSON.parse_string(f.get_as_text())
		f.close()
		if not (meta is Dictionary):
			push_error("FAIL: slash_arc_meta.json invalid")
			ok = false
		else:
			var fps: float = float(meta.get("fps", 0.0))
			var frames: int = int(meta.get("frames", 0))
			# At 9 frames @ 50fps the animation runs 0.18s — exactly
			# ATTACK_SWING_TIME in hero.gd. Lets the slash visual start
			# AND finish within the swing window.
			if fps < 45.0:
				push_error("FAIL: slash_arc fps is %s, should be ≥45 to fit ATTACK_SWING_TIME 0.18s" % fps)
				ok = false
			else:
				var duration: float = float(frames) / fps
				print("OK slash_arc fps=%s, %d frames → %.3fs duration (target ≤0.18s ATTACK_SWING_TIME)" % [fps, frames, duration])
				if duration > 0.20:
					push_error("FAIL: slash_arc duration %.3fs exceeds swing window 0.18s (+slack)" % duration)
					ok = false

	# ═══ Runtime smoke — slash parented to passed host ═══
	# Structural check: FxSprite.spawn must add the new node as a child
	# of the passed host. Godot's transform propagation (fx follows host
	# global_position changes) is a SceneTree-frame thing that doesn't
	# settle synchronously inside _initialize, so we assert the parent
	# relationship rather than test live motion — at game runtime the
	# transform pipeline runs every frame and the follow-along works.
	var fxs := load("res://scripts/fx_sprite.gd")
	if fxs != null and fxs.has_method("spawn"):
		var host := Node2D.new()
		host.global_position = Vector2(100, 100)
		root.add_child(host)
		var fx = fxs.spawn(host, Vector2(110, 100), "slash_arc", {})
		if fx == null:
			push_error("FAIL: FxSprite.spawn returned null for slash_arc")
			ok = false
		elif fx.get_parent() != host:
			push_error("FAIL: FxSprite.spawn didn't parent to passed host (parent=%s)" % str(fx.get_parent()))
			ok = false
		else:
			print("OK FxSprite.spawn parents the new node under the passed host")

	if ok:
		print("=== ITER 90 INTEGRATION PASSED ===")
	else:
		print("=== ITER 90 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
