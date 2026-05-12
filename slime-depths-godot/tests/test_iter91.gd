extends SceneTree

# Iter 91 — FxSprite spawn position bug fix.
#
# User reported after iter-90: "mele feels completely bugged now, like
# the sword appears totally somewhere else." Diagnosis:
#
# FxSprite.spawn() set `fx.global_position = world_pos` BEFORE
# `host.add_child(fx)`. When the node has no parent yet, that assignment
# is equivalent to setting LOCAL position. After add_child the parent
# transform applies, so the actual global position becomes
#   host.global_position + world_pos
# instead of just world_pos.
#
# Iter-89 + earlier worked accidentally because every FX was parented to
# current_scene (origin → no offset). Iter-90 re-parented the slash to
# the HERO, which is offset from origin, exposing the bug.
#
# Fix: move `fx.global_position = world_pos` to AFTER `host.add_child(fx)`.
# Godot's setter then uses the inverse parent transform to resolve the
# correct local position, regardless of host location.
func _initialize() -> void:
	var ok := true

	# ═══ Source assertion — global_position set after add_child ═══
	var src := FileAccess.get_file_as_string("res://scripts/fx_sprite.gd")
	# Build a tiny string slice and verify ordering. We can locate both
	# substrings and check their positions in the source.
	var idx_add: int = src.find("host.add_child(fx)")
	var idx_pos: int = src.find("fx.global_position = world_pos")
	if idx_add < 0 or idx_pos < 0:
		push_error("FAIL: fx_sprite.gd missing expected add_child or global_position assignment")
		ok = false
	elif idx_pos < idx_add:
		push_error("FAIL: fx_sprite.gd sets global_position BEFORE add_child (bug — would offset by host position)")
		ok = false
	else:
		print("OK fx_sprite.gd sets global_position AFTER add_child")

	# ═══ Runtime check — FX lands at world_pos under a non-origin host ═══
	var fxs := load("res://scripts/fx_sprite.gd")
	if fxs != null and fxs.has_method("spawn"):
		var host := Node2D.new()
		# Critical: host at NON-ZERO position. This is what exposes the
		# iter-90 regression — a host at (0, 0) hides the bug entirely.
		host.position = Vector2(300, 200)
		root.add_child(host)
		var requested_world: Vector2 = Vector2(640, 384)
		var fx = fxs.spawn(host, requested_world, "slash_arc", {})
		if fx == null:
			push_error("FAIL: FxSprite.spawn returned null")
			ok = false
		else:
			# After add_child + global_position assignment, fx should be at
			# the requested world coord — NOT at host_pos + requested.
			var got: Vector2 = fx.global_position
			var bug_pos: Vector2 = host.position + requested_world
			if got.distance_to(requested_world) < 0.5:
				print("OK FxSprite lands at requested world_pos (%s) under non-origin host (%s)" % [str(requested_world), str(host.position)])
			elif got.distance_to(bug_pos) < 0.5:
				push_error("FAIL: FX at host+world (%s) instead of world (%s) — iter-90 regression alive" % [str(got), str(requested_world)])
				ok = false
			else:
				push_error("FAIL: FX at unexpected position %s — expected %s" % [str(got), str(requested_world)])
				ok = false

	if ok:
		print("=== ITER 91 INTEGRATION PASSED ===")
	else:
		print("=== ITER 91 INTEGRATION FAILED ===")
	quit(0 if ok else 1)
